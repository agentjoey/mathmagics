import { describe, it, expect } from 'vitest';
import { minimaxChat } from '@/lib/providers/minimax';

const SKIP = !process.env.RUN_SMOKE_TESTS;

describe.skipIf(SKIP)('minimax smoke', () => {
  it('returns a non-empty stream', async () => {
    const stream = await minimaxChat({
      system: 'You are a calculator. Respond with only digits.',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      maxTokens: 256,
    });
    let text = '';
    for await (const chunk of stream.textStream) text += chunk;
    expect(text).toMatch(/4/);
  }, 15000);
});
