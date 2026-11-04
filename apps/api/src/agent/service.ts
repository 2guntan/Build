import { EventEmitter } from 'node:events';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { AgentEvent } from '@fs/api-contract';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { agentRun, agentStep, contextBuilding, designOption, recipeVersion } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { projectContext } from '../services/evaluation.js';
import { saveVersion } from '../services/options.js';
import { frameFor, outerRingLonLat } from '../services/site.js';
import type { Recipe } from '@fs/recipe';
import { runAgentLoop, type ModelClient } from './loop.js';
import type { AgentCandidate, AgentWorkspace } from './workspace.js';

export interface StartRunArgs {
  optionId: string;
  orgId: string;
  userId: string;
  prompt: string;
  image?: { mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string } | undefined;
  locale: 'fr' | 'en';
}

export class AgentService {
  private readonly bus = new EventEmitter();
  constructor(
    private readonly db: Db,
    private readonly cfg: Config,
    private readonly client: ModelClient | null,
  ) {
    this.bus.setMaxListeners(200);
  }

  get available() {
    return this.client !== null;
  }

  private async checkBudget(orgId: string) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const [row] = await this.db
      .select({ tokens: sql<number>`coalesce(sum(${agentRun.tokensIn} + ${agentRun.tokensOut}), 0)::int` })
      .from(agentRun)
      .where(and(eq(agentRun.orgId, orgId), gte(agentRun.createdAt, since)));
    if ((row?.tokens ?? 0) >= this.cfg.AGENT_DAILY_TOKEN_BUDGET) {
      throw new ProblemError('AGENT_BUDGET_EXCEEDED', 'Daily token budget reached');
    }
    const [running] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(agentRun)
      .where(and(eq(agentRun.orgId, orgId), inArray(agentRun.status, ['queued', 'running'])));
    if ((running?.n ?? 0) >= this.cfg.AGENT_MAX_CONCURRENT) {
      throw new ProblemError('AGENT_BUDGET_EXCEEDED', `At most ${this.cfg.AGENT_MAX_CONCURRENT} concurrent runs`, undefined, {
        fr: `Au plus ${this.cfg.AGENT_MAX_CONCURRENT} requêtes simultanées à l'assistant.`,
        en: `At most ${this.cfg.AGENT_MAX_CONCURRENT} concurrent assistant runs.`,
      });
    }
  }

  async buildWorkspace(optionId: string): Promise<AgentWorkspace> {
    const [opt] = await this.db.select().from(designOption).where(eq(designOption.id, optionId));
    if (!opt) throw new ProblemError('NOT_FOUND');
    const ctx = await projectContext(this.db, this.cfg, opt.projectId, opt.ruleSetId);
    if (!ctx.site || !ctx.plot) throw new ProblemError('PLOT_INVALID', 'Draw the plot before using the assistant');
    if (!ctx.zone || !ctx.ruleSet) throw new ProblemError('RULESET_NOT_PUBLISHED', 'Pick a zone and rule set first');
    let recipe: Recipe | null = null;
    if (opt.headVersionId) {
      const [v] = await this.db.select().from(recipeVersion).where(eq(recipeVersion.id, opt.headVersionId));
      recipe = (v?.recipe as Recipe) ?? null;
    }
    const frame = frameFor(ctx.plot);
    const buildings = await this.db
      .select()
      .from(contextBuilding)
      .where(and(eq(contextBuilding.projectId, opt.projectId), eq(contextBuilding.deleted, false)));
    return {
      site: ctx.site,
      zone: ctx.zone,
      ruleSet: ctx.ruleSet,
      isTest: ctx.isTest,
      recipe,
      assumptions: ctx.assumptions,
      base: {
        optionId: opt.id,
        origin: { lon: ctx.plot.originLon, lat: ctx.plot.originLat, crs: ctx.plot.crs },
        plotRef: ctx.plot.id,
      },
      context: buildings.map((b) => ({
        id: b.id,
        heightM: b.heightM,
        ring: outerRingLonLat(b.geom).map(([lon, lat]) => frame.toLocal(lon, lat)),
      })),
      lat: ctx.plot.originLat,
      lon: ctx.plot.originLon,
      nonCompliantStudy: opt.nonCompliantStudy,
      candidates: new Map(),
      lastCandidateId: null,
      editCounter: 0,
    };
  }

  async start(a: StartRunArgs): Promise<string> {
    if (!this.client) throw new ProblemError('AGENT_UNAVAILABLE');
    await this.checkBudget(a.orgId);
    const ws = await this.buildWorkspace(a.optionId);
    const [run] = await this.db
      .insert(agentRun)
      .values({ optionId: a.optionId, orgId: a.orgId, userId: a.userId, prompt: a.prompt, model: this.cfg.AGENT_MODEL, status: 'running' })
      .returning();
    void this.execute(run!.id, ws, a);
    return run!.id;
  }

  /** Waits until a run finishes (tests, benchmark). */
  waitFor(runId: string): Promise<void> {
    return new Promise((resolve) => {
      const check = async () => {
        const [r] = await this.db.select({ status: agentRun.status }).from(agentRun).where(eq(agentRun.id, runId));
        if (r && r.status !== 'running' && r.status !== 'queued') {
          this.bus.off(runId, onEvent);
          resolve();
        }
      };
      const onEvent = (e: AgentEvent) => {
        if (e.type === 'done' || e.type === 'error') void check();
      };
      this.bus.on(runId, onEvent);
      void check();
    });
  }

  private emit(runId: string, e: AgentEvent) {
    this.bus.emit(runId, e);
  }

  private async execute(runId: string, ws: AgentWorkspace, a: StartRunArgs) {
    try {
      this.emit(runId, { type: 'status', status: 'running' });
      const res = await runAgentLoop({
        client: this.client!,
        model: this.cfg.AGENT_MODEL,
        ws,
        prompt: a.prompt,
        image: a.image,
        locale: a.locale,
        maxToolCalls: this.cfg.AGENT_MAX_TOOL_CALLS,
        onEvent: async (e) => {
          if (e.type === 'step') {
            await this.db.insert(agentStep).values({
              runId,
              seq: e.seq,
              tool: e.tool,
              input: e.input as object,
              output: (e.output ?? null) as object,
              durationMs: e.durationMs,
              error: e.error,
            });
          }
          this.emit(runId, e);
        },
      });
      const candidates = [...ws.candidates.values()].slice(-6);
      const costUsd = (res.tokensIn * this.cfg.AGENT_PRICE_IN_PER_MTOK + res.tokensOut * this.cfg.AGENT_PRICE_OUT_PER_MTOK) / 1e6;
      await this.db
        .update(agentRun)
        .set({
          status: res.stopReason === 'refusal' ? 'failed' : 'done',
          tokensIn: res.tokensIn,
          tokensOut: res.tokensOut,
          costUsd,
          explanation: res.explanation,
          candidates,
          proposedCandidateId: res.proposedCandidateId,
          error: res.stopReason === 'refusal' ? 'refusal' : null,
          finishedAt: new Date(),
        })
        .where(eq(agentRun.id, runId));
      this.emit(runId, { type: 'candidates', candidates: candidates as never });
      this.emit(runId, { type: 'done', explanation: res.explanation, proposedCandidateId: res.proposedCandidateId, tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.db.update(agentRun).set({ status: 'failed', error: msg, finishedAt: new Date() }).where(eq(agentRun.id, runId));
      this.emit(runId, { type: 'error', code: 'AGENT_FAILED', message: msg });
    }
  }

  /** Replays stored events, then follows live ones until the run ends. */
  async stream(runId: string, send: (e: AgentEvent) => void, signal: AbortSignal): Promise<void> {
    const live: AgentEvent[] = [];
    let replayed = false;
    let finished = false;
    const onEvent = (e: AgentEvent) => {
      if (!replayed) live.push(e);
      else send(e);
      if (e.type === 'done' || e.type === 'error') finished = true;
    };
    this.bus.on(runId, onEvent);
    try {
      const [run] = await this.db.select().from(agentRun).where(eq(agentRun.id, runId));
      if (!run) throw new ProblemError('NOT_FOUND');
      const steps = await this.db.select().from(agentStep).where(eq(agentStep.runId, runId)).orderBy(agentStep.seq);
      send({ type: 'status', status: run.status });
      const seen = new Set<number>();
      for (const s of steps) {
        seen.add(s.seq);
        send({ type: 'step', seq: s.seq, tool: s.tool, input: s.input, output: s.output, durationMs: s.durationMs, error: s.error });
      }
      const ended = run.status !== 'running' && run.status !== 'queued';
      if (ended) {
        if (run.candidates) send({ type: 'candidates', candidates: run.candidates as never });
        if (run.status === 'failed') send({ type: 'error', code: 'AGENT_FAILED', message: run.error ?? 'failed' });
        else send({ type: 'done', explanation: run.explanation ?? '', proposedCandidateId: run.proposedCandidateId, tokensIn: run.tokensIn, tokensOut: run.tokensOut, costUsd: run.costUsd });
        return;
      }
      for (const e of live) if (!(e.type === 'step' && seen.has(e.seq))) send(e);
      replayed = true;
      if (live.some((e) => e.type === 'done' || e.type === 'error')) return;
      await new Promise<void>((resolve) => {
        const t = setInterval(() => {
          if (finished || signal.aborted) {
            clearInterval(t);
            resolve();
          }
        }, 100);
      });
    } finally {
      this.bus.off(runId, onEvent);
    }
  }

  async accept(runId: string, userId: string, candidateId?: string) {
    const [run] = await this.db.select().from(agentRun).where(eq(agentRun.id, runId));
    if (!run) throw new ProblemError('NOT_FOUND');
    if (run.status !== 'done') throw new ProblemError('CONFLICT', `Run is ${run.status}`);
    const cands = (run.candidates ?? []) as AgentCandidate[];
    const id = candidateId ?? run.proposedCandidateId;
    const c = cands.find((x) => x.id === id);
    if (!c) throw new ProblemError('NOT_FOUND', 'Candidate not found in this run');
    const saved = await saveVersion(this.db, this.cfg, {
      optionId: run.optionId,
      recipe: { ...c.recipe, meta: { ...c.recipe.meta, createdBy: 'agent', intent: run.prompt.slice(0, 300) } },
      authorKind: 'agent',
      authorId: userId,
      summary: `Assistant: ${run.prompt.slice(0, 120)}`,
    });
    await this.db.update(agentRun).set({ status: 'accepted', resultVersionId: saved.version.id }).where(eq(agentRun.id, runId));
    return saved;
  }
}
