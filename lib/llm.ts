import type { LLMRequest, LLMStream, LLMProvider } from './types';
import { minimaxChat } from './providers/minimax';

export function getProvider(): LLMProvider {
  const p = (process.env.LLM_PROVIDER || 'minimax') as LLMProvider;
  if (p !== 'minimax') {
    throw new Error(`Invalid LLM_PROVIDER: ${p}. Only minimax is supported.`);
  }
  return p;
}

export async function chat(req: LLMRequest): Promise<LLMStream> {
  return minimaxChat(req);
}
