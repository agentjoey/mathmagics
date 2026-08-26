import { describe, expect, it } from 'vitest';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonMistakeRepository } from '@/lib/persistence/neon-correction-repository';
import { NeonPracticeRepository } from '@/lib/persistence/neon-practice-repository';

const describeLive = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describe('Phase 6 Neon repository surface', () => {
  it('exposes append-only mistake methods and the correction Attempt query', () => {
    expect(NeonMistakeRepository.prototype.appendMistake).toBeTypeOf('function');
    expect(NeonMistakeRepository.prototype.appendEvent).toBeTypeOf('function');
    expect(NeonMistakeRepository.prototype.appendCorrectionItem).toBeTypeOf('function');
    expect(NeonMistakeRepository.prototype.appendReasoningCheck).toBeTypeOf('function');
    expect(NeonPracticeRepository.prototype.listAttemptsForCorrectionItem).toBeTypeOf('function');
    expect((NeonMistakeRepository.prototype as unknown as Record<string, unknown>).markResolved).toBeUndefined();
    expect((NeonMistakeRepository.prototype as unknown as Record<string, unknown>).updateMistake).toBeUndefined();
  });
});

describeLive('Phase 6 Neon live contract', () => {
  it('constructs only from explicit TEST_DATABASE_URL without production fallback', () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const db = createNeonDatabase(databaseUrl);
    expect(new NeonMistakeRepository(db)).toBeInstanceOf(NeonMistakeRepository);
    expect(new NeonPracticeRepository(db)).toBeInstanceOf(NeonPracticeRepository);
  });
});
