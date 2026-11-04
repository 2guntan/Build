import type { AgentEvent, Problem } from '@fs/api-contract';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Partial<Problem>,
  ) {
    super(problem.message_en ?? problem.title ?? `HTTP ${status}`);
  }
}

const BASE = '/api/v1';

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: init.body !== undefined ? JSON.stringify(init.body) : null,
    signal: init.signal ?? null,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data ?? {});
  return data as T;
}

export function problemMessage(e: unknown, lang: string): string {
  if (e instanceof ApiError) return (lang === 'en' ? e.problem.message_en : e.problem.message_fr) ?? e.message;
  return e instanceof Error ? e.message : String(e);
}

/** Subscribes to an agent run's SSE stream. Returns a disposer. */
export function streamAgentRun(runId: string, onEvent: (e: AgentEvent) => void): () => void {
  const es = new EventSource(`${BASE}/agent-runs/${runId}/stream`, { withCredentials: true });
  const handler = (m: MessageEvent<string>) => {
    const e = JSON.parse(m.data) as AgentEvent;
    onEvent(e);
    if (e.type === 'done' || e.type === 'error') es.close();
  };
  for (const t of ['status', 'step', 'text', 'delta', 'candidates', 'done', 'error']) es.addEventListener(t, handler as EventListener);
  es.onerror = () => es.close();
  return () => es.close();
}

/* ---------- Auth (Better Auth endpoints) ---------- */
export const auth = {
  signUp: (b: { name: string; email: string; password: string }) => api('/auth/sign-up/email', { method: 'POST', body: b }),
  signIn: (b: { email: string; password: string }) => api('/auth/sign-in/email', { method: 'POST', body: b }),
  signOut: () => api('/auth/sign-out', { method: 'POST', body: {} }),
  google: () => api<{ url: string }>('/auth/sign-in/social', { method: 'POST', body: { provider: 'google', callbackURL: window.location.origin } }),
};
