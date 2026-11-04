import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Check, Eye, EyeOff, Loader2, Paperclip, Send, Sparkles, TriangleAlert } from 'lucide-react';
import type { AgentEvent } from '@fs/api-contract';
import type { Recipe } from '@fs/recipe';
import { api, problemMessage, streamAgentRun } from '../api/client';
import { Badge, Button } from '../components/ui';
import { m2, money, pct, storeys } from '../lib/format';
import { useDesignStore } from '../state/design-store';
import { buildWorker } from '../workers/client';

interface Candidate {
  id: string;
  template: string;
  recipe: Recipe;
  metrics: { gfaM2: number; maxFloors: number; footprintAreaM2: number; plotAreaM2: number; maxHeightM: number };
  compliance: { compliant: boolean };
  yield: { complete: boolean; margin: number; currency: string };
}

interface Turn {
  prompt: string;
  runId: string | null;
  steps: { seq: number; tool: string; error: string | null }[];
  text: string;
  candidates: Candidate[];
  proposed: string | null;
  accepted: string | null;
  error: string | null;
  done: boolean;
}

function CandidateThumb({ recipe }: { recipe: Recipe }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const d = useDesignStore.getState();
    if (!d.site) return;
    void (async () => {
      const br = await buildWorker().build(recipe, d.site!);
      const { renderThumbnail } = await import('../viewport/thumbnail');
      const png = renderThumbnail({ build: br, plot: d.site!.plot, buildable: d.site!.buildable, context: d.context, width: 320, height: 200 });
      if (alive) setSrc(png);
    })();
    return () => {
      alive = false;
    };
  }, [recipe]);
  return src ? <img src={src} alt="" className="h-28 w-full rounded-md object-cover" /> : <div className="h-28 w-full animate-pulse rounded-md bg-line/60" />;
}

export function AssistantPanel({ optionId, onAccepted }: { optionId: string; onAccepted: () => void }) {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<{ mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string; name: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const stop = useRef<(() => void) | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const ghostId = useDesignStore((s) => s.ghostId);
  const setGhost = useDesignStore((s) => s.setGhost);
  useEffect(
    () => () => {
      stop.current?.();
      void useDesignStore.getState().setGhost(null, null);
    },
    [],
  );
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const update = (i: number, f: (t: Turn) => Turn) => setTurns((ts) => ts.map((x, j) => (j === i ? f(x) : x)));

  const send = async (text = prompt) => {
    const p = text.trim();
    if (!p) return;
    const idx = turns.length;
    setTurns((ts) => [...ts, { prompt: p, runId: null, steps: [], text: '', candidates: [], proposed: null, accepted: null, error: null, done: false }]);
    setPrompt('');
    try {
      const { runId } = await api<{ runId: string }>(`/options/${optionId}/agent-runs`, {
        method: 'POST',
        body: { prompt: p, locale: i18n.language, ...(image ? { image: { mediaType: image.mediaType, data: image.data } } : {}) },
      });
      setImage(null);
      update(idx, (x) => ({ ...x, runId }));
      let streamed = '';
      stop.current = streamAgentRun(runId, (e: AgentEvent) => {
        if (e.type === 'step') update(idx, (x) => (x.steps.some((s) => s.seq === e.seq) ? x : { ...x, steps: [...x.steps, { seq: e.seq, tool: e.tool, error: e.error }] }));
        if (e.type === 'delta') {
          streamed += e.text;
          const s = streamed;
          update(idx, (x) => ({ ...x, text: s }));
        }
        if (e.type === 'text') update(idx, (x) => ({ ...x, text: e.text }));
        if (e.type === 'candidates') update(idx, (x) => ({ ...x, candidates: e.candidates as unknown as Candidate[] }));
        if (e.type === 'done') update(idx, (x) => ({ ...x, text: e.explanation || x.text, proposed: e.proposedCandidateId, done: true }));
        if (e.type === 'error') update(idx, (x) => ({ ...x, error: e.message, done: true }));
      });
    } catch (e) {
      update(idx, (x) => ({ ...x, error: problemMessage(e, i18n.language), done: true }));
    }
  };

  const accept = async (i: number, c: Candidate) => {
    const run = turns[i]!.runId!;
    await api(`/agent-runs/${run}/accept`, { method: 'POST', body: { candidateId: c.id } });
    update(i, (x) => ({ ...x, accepted: c.id }));
    setGhost(null, null);
    onAccepted();
  };

  const examples = [t('assistant.ex1'), t('assistant.ex2'), t('assistant.ex3')];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="space-y-3 rounded-lg border border-dashed border-line p-4 text-sm">
            <div className="flex items-center gap-2 font-medium"><Sparkles size={16} className="text-accent" /> {t('assistant.welcome')}</div>
            <p className="text-xs text-muted">{t('assistant.welcomeHint')}</p>
            <div className="flex flex-col gap-1.5">
              {examples.map((ex) => (
                <button key={ex} onClick={() => void send(ex)} className="rounded-md border border-line px-2.5 py-1.5 text-left text-xs hover:border-accent hover:text-accent">{ex}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-8 rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-accent-ink">{turn.prompt}</div>
            <div className="flex gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-accent"><Bot size={14} /></span>
              <div className="min-w-0 flex-1 space-y-2">
                {turn.steps.length > 0 && (
                  <ol className="space-y-0.5 text-xs text-muted">
                    {turn.steps.map((s) => (
                      <li key={s.seq} className="flex items-center gap-1.5">
                        {s.error ? <TriangleAlert size={12} className="text-warn" /> : <Check size={12} className="text-ok" />} {t(`tools.${s.tool}`, { defaultValue: s.tool })}
                      </li>
                    ))}
                  </ol>
                )}
                {!turn.done && !turn.text && <p className="flex items-center gap-1.5 text-xs text-muted"><Loader2 size={12} className="animate-spin" /> {t('assistant.thinking')}</p>}
                {turn.text && (
                  <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm leading-relaxed">
                    {turn.text}
                    {!turn.done && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />}
                  </div>
                )}
                {turn.error && <p role="alert" className="text-sm text-bad">{turn.error}</p>}
                {turn.candidates.map((c) => {
                  const previewing = ghostId === c.id;
                  return (
                    <div key={c.id} className={`space-y-2 rounded-lg border p-2 text-xs ${c.id === turn.proposed ? 'border-accent shadow-sm' : 'border-line'}`}>
                      <CandidateThumb recipe={c.recipe} />
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{t(`templates.${c.template}`, { defaultValue: c.template })}{c.id === turn.proposed && <span className="ml-1 text-accent">· {t('assistant.recommended')}</span>}</span>
                        <Badge tone={c.compliance.compliant ? 'ok' : 'bad'}>{c.compliance.compliant ? t('assistant.compliant') : t('assistant.nonCompliant')}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-muted">
                        <span><b className="text-ink">{m2(c.metrics.gfaM2)}</b></span>
                        <span>{storeys(c.metrics.maxFloors)}</span>
                        <span>{pct(c.metrics.plotAreaM2 ? c.metrics.footprintAreaM2 / c.metrics.plotAreaM2 : 0)}</span>
                      </div>
                      {c.yield.complete && <div className="text-muted">{t('yield.margin')} {money(c.yield.margin, c.yield.currency)}</div>}
                      <div className="flex gap-1.5">
                        <Button className="flex-1" onClick={() => void setGhost(previewing ? null : c.id, previewing ? null : c.recipe)}>
                          {previewing ? <EyeOff size={14} /> : <Eye size={14} />} {previewing ? t('assistant.hidePreview') : t('assistant.preview')}
                        </Button>
                        <Button className="flex-1" variant={turn.accepted === c.id ? 'default' : 'primary'} disabled={!!turn.accepted} onClick={() => void accept(i, c)}>
                          {turn.accepted === c.id ? <><Check size={14} /> {t('assistant.accepted')}</> : t('assistant.accept')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="space-y-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label={t('assistant.placeholder')}
          className="h-20 w-full resize-none rounded-lg border border-line bg-panel p-2 text-sm outline-none focus:border-accent"
          placeholder={t('assistant.placeholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-ink">
            <Paperclip size={14} /> {image ? image.name : t('assistant.attach')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || f.size > 5 * 1024 * 1024) return;
                const bytes = new Uint8Array(await f.arrayBuffer());
                let bin = '';
                for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
                setImage({ mediaType: f.type as 'image/png', data: btoa(bin), name: f.name });
              }}
            />
          </label>
          <Button variant="primary" type="submit" disabled={!prompt.trim()}><Send size={14} /> {t('assistant.send')}</Button>
        </div>
      </form>
    </div>
  );
}
