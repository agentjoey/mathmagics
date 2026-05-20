import type { LLMRequest, LLMStream } from '../types';

export async function kimiChat(_req: LLMRequest): Promise<LLMStream> {
  throw new Error('kimiChat not implemented yet');
}
