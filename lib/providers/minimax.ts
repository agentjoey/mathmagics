import Anthropic from '@anthropic-ai/sdk';
import type { LLMRequest, LLMStream } from '../types';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) throw new Error('MINIMAX_API_KEY not set');
    client = new Anthropic({
      apiKey,
      baseURL: 'https://api.minimax.io/anthropic',
    });
  }
  return client;
}

export async function minimaxChat(req: LLMRequest): Promise<LLMStream> {
  const stream = getClient().messages.stream({
    model: 'MiniMax-M2.7-highspeed',
    max_tokens: req.maxTokens ?? 1024,
    system: req.system,
    messages: req.messages.map(m => ({ role: m.role, content: m.content })),
  });

  async function* textStream(): AsyncIterable<string> {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }

  return { textStream: textStream() };
}
