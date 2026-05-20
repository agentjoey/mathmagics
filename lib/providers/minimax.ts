import type { LLMRequest, LLMStream } from '../types';

export async function minimaxChat(_req: LLMRequest): Promise<LLMStream> {
  throw new Error('minimaxChat not implemented yet');
}
