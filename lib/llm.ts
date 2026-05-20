import type { LLMRequest, LLMStream, LLMProvider } from './types';
import { kimiChat } from './providers/kimi';
import { minimaxChat } from './providers/minimax';

export function getProvider(): LLMProvider {
  const p = (process.env.LLM_PROVIDER || 'kimi') as LLMProvider;
  if (!['kimi', 'minimax'].includes(p)) {
    throw new Error(`Invalid LLM_PROVIDER: ${p}`);
  }
  return p;
}

export async function chat(req: LLMRequest): Promise<LLMStream> {
  switch (getProvider()) {
    case 'kimi':    return kimiChat(req);
    case 'minimax': return minimaxChat(req);
  }
}
