import type Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ModelRequest, ModelResponse } from './loop.js';

/**
 * Deterministic stand-in for Claude used in tests and when no API key is configured
 * with AGENT_OFFLINE=true. It follows the system prompt's procedure: site summary,
 * rules, then propose_massing with an intent parsed from simple keywords.
 */
export class ScriptedModelClient implements ModelClient {
  calls = 0;
  async create(req: ModelRequest, onText?: (delta: string) => void): Promise<ModelResponse> {
    this.calls++;
    const first = req.messages[0]!;
    const prompt = Array.isArray(first.content)
      ? first.content.map((b) => ('text' in b ? b.text : '')).join(' ')
      : String(first.content);
    const toolTurns = req.messages.filter((m) => m.role === 'assistant').length;
    const use = (name: string, input: unknown): ModelResponse => ({
      content: [{ type: 'tool_use', id: `tu_${this.calls}`, name, input, caller: { type: 'direct' } } as unknown as Anthropic.Beta.BetaContentBlock],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1000, output_tokens: 50 },
    });
    if (toolTurns === 0) return use('get_site_summary', {});
    if (toolTurns === 1) return use('get_rules', {});
    if (toolTurns === 2) {
      const p = prompt.toLowerCase();
      const floors = /r\+(\d+)/.exec(p);
      const intent: Record<string, unknown> = {
        targetUse: /bureau|office/.test(p) ? 'office' : /mixte|mixed|commerce|retail/.test(p) ? 'mixed' : 'residential',
      };
      if (floors) intent.floors = Number(floors[1]) + 1;
      const gfa = /(\d[\d\s]{2,})\s*m²/.exec(p);
      if (gfa) intent.targetGfa = Number(gfa[1]!.replace(/\s/g, ''));
      if (/tour|tower/.test(p)) intent.layout = 'towers';
      return use('propose_massing', intent);
    }
    const last = req.messages[req.messages.length - 1]!;
    const resultText = Array.isArray(last.content)
      ? last.content.map((b) => ('content' in b && typeof b.content === 'string' ? b.content : '')).join('')
      : '';
    let best = 'none';
    try {
      const parsed = JSON.parse(resultText) as { candidates?: { id: string; gfaM2: number; floorsMax: number }[] };
      const c = parsed.candidates?.[0];
      if (c) best = `${c.id} — SDP ${Math.round(c.gfaM2)} m², R+${c.floorsMax - 1}`;
    } catch {
      /* keep default */
    }
    const text = `Proposition (assistant hors ligne) : ${best}. Les règles utilisées sont des règles de TEST, non officielles.`;
    for (const w of text.match(/\S+\s*/g) ?? []) onText?.(w);
    return {
      content: [{ type: 'text', text, citations: null } as Anthropic.Beta.BetaContentBlock],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1200, output_tokens: 80 },
    };
  }
}
