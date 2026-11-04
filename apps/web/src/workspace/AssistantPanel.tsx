import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentEvent } from '@fs/api-contract';
import { api, problemMessage, streamAgentRun } from '../api/client';
import { Badge, Button } from '../components/ui';
import { m2, money, pct, storeys } from '../lib/format';

interface Candidate {
  id: string;
  template: string;
  metrics: { gfaM2: number; maxFloors: number; footprintAreaM2: number; plotAreaM2: number };
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

export function AssistantPanel({ optionId, onAccepted }: { optionId: string; onAccepted: () => void }) {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<{ mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const update = (i: number, f: (t: Turn) => Turn) => setTurns((ts) => ts.map((x, j) => (j === i ? f(x) : x)));

  const send = async () => {
    const p = prompt.trim();
    if (!p) return;
    const idx = turns.length;
    setTurns((ts) => [...ts, { prompt: p, runId: null, steps: [], text: '', candidates: [], proposed: null, accepted: null, error: null, done: false }]);
    setPrompt('');
    try {
      const { runId } = await api<{ runId: string }>(`/options/${optionId}/agent-runs`, {
        method: 'POST',
        body: { prompt: p, locale: i18n.language, ...(image ? { image } : {}) },
      });
      setImage(null);
      update(idx, (x) => ({ ...x, runId }));
      stop.current = streamAgentRun(runId, (e: AgentEvent) => {
        if (e.type === 'step') update(idx, (x) => (x.steps.some((s) => s.seq === e.seq) ? x : { ...x, steps: [...x.steps, { seq: e.seq, tool: e.tool, error: e.error }] }));
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
    onAccepted();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite">
        {turns.map((turn, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-6 rounded-lg bg-accent px-3 py-2 text-sm text-white">{turn.prompt}</div>
            {turn.steps.length > 0 && (
              <ol className="space-y-0.5 text-xs text-muted">
                {turn.steps.map((s) => (
                  <li key={s.seq}>
                    {s.error ? '⚠' : '✓'} {t(`tools.${s.tool}`, { defaultValue: s.tool })}
                  </li>
                ))}
              </ol>
            )}
            {!turn.done && <p className="text-xs text-muted">{t('assistant.thinking')}</p>}
            {turn.text && <div className="whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-sm">{turn.text}</div>}
            {turn.error && <p role="alert" className="text-sm text-bad">{turn.error}</p>}
            {turn.candidates.map((c) => (
              <div key={c.id} className={`rounded-lg border p-2 text-xs ${c.id === turn.proposed ? 'border-accent' : 'border-line'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t('assistant.candidate')} {c.template}</span>
                  <Badge tone={c.compliance.compliant ? 'ok' : 'bad'}>{c.compliance.compliant ? t('assistant.compliant') : t('assistant.nonCompliant')}</Badge>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-muted">
                  <span>{m2(c.metrics.gfaM2)}</span>
                  <span>{storeys(c.metrics.maxFloors)}</span>
                  <span>{pct(c.metrics.plotAreaM2 ? c.metrics.footprintAreaM2 / c.metrics.plotAreaM2 : 0)}</span>
                </div>
                {c.yield.complete && <div className="text-muted">{money(c.yield.margin, c.yield.currency)}</div>}
                <Button className="mt-2 w-full" variant={turn.accepted === c.id ? 'default' : 'primary'} disabled={!!turn.accepted} onClick={() => void accept(i, c)}>
                  {turn.accepted === c.id ? t('assistant.accepted') : t('assistant.accept')}
                </Button>
              </div>
            ))}
          </div>
        ))}
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
          className="h-20 w-full resize-none rounded-md border border-line p-2 text-sm outline-none focus:border-accent"
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
          <label className="cursor-pointer text-xs text-muted">
            📎 {image ? '✓' : t('assistant.attach')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || f.size > 5 * 1024 * 1024) return;
                const data = btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer())));
                setImage({ mediaType: f.type as 'image/png', data });
              }}
            />
          </label>
          <Button variant="primary" type="submit" disabled={!prompt.trim()}>{t('assistant.send')}</Button>
        </div>
      </form>
    </div>
  );
}
