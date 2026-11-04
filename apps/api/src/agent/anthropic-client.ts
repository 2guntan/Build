import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ModelRequest, ModelResponse } from './loop.js';

/**
 * Claude API client. Server-only: the key never leaves the API process.
 * - Prompt caching on the tool list and the system prompt (stable prefix).
 * - Adaptive thinking (the model default) with explicit effort.
 * - Server-side refusal fallback ("default" routing).
 */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  async create(req: ModelRequest, onText?: (delta: string) => void): Promise<ModelResponse> {
    const tools = req.tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
      ...(i === req.tools.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
    // Streaming so the user sees the explanation as it is written; finalMessage() gives the full turn.
    const stream = this.client.beta.messages.stream({
      model: req.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: req.messages,
    } as Anthropic.Beta.MessageCreateParamsStreaming);
    if (onText) stream.on('text', (d: string) => onText(d));
    const res = await stream.finalMessage();
    return { content: res.content, stop_reason: res.stop_reason, usage: res.usage };
  }
}
