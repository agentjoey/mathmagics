import { describe, expect, it } from 'vitest';
import { MemoryPracticeRepository } from '@/lib/practice';
import type { Attempt } from '@/lib/practice';
import { MemoryStrategyRepository } from '@/lib/strategy/memory-repository';
import { StrategyRecorder } from '@/lib/strategy/recorder';

const NOW = '2026-08-26T10:00:00.000Z';
const baseInput = {
  interactionId: 'interaction-1',
  evidenceId: 'evidence-1',
  studentId: 'student-1',
  objectiveId: 'P2-AS-002',
  strategyId: 'STRAT-BAR-PART-WHOLE',
  sourceKind: 'PRACTICE' as const,
  sourceRefId: 'attempt-1',
  assistanceRevealed: false,
  interactionKind: 'SELECTION' as const,
  structurallyValid: true,
};

describe('StrategyRecorder', () => {
  it('does not infer strategy evidence from a correct Attempt alone', async () => {
    const practice = new MemoryPracticeRepository();
    const strategies = new MemoryStrategyRepository();
    const correctAttempt: Attempt = {
      id: 'attempt-1',
      source: { kind: 'HOMEWORK', submissionId: 'homework-1', problemId: 'problem-1' },
      studentId: 'student-1',
      objectiveId: 'P2-AS-002',
      answerText: '12',
      outcome: 'CORRECT',
      hintUsed: false,
      gradingPolicyVersion: 'grading-v1',
      submittedAt: NOW,
      recordedAt: NOW,
    };

    await practice.appendAttempt(correctAttempt);
    expect(await strategies.listEvidenceForStudent('student-1', NOW)).toEqual([]);
  });

  it.each([
    [{ assistanceRevealed: true, interactionKind: 'SELECTION' as const, structurallyValid: true }, 'PROMPTED', 'PROMPTED_USE'],
    [{ assistanceRevealed: false, interactionKind: 'SELECTION' as const, structurallyValid: true }, 'INDEPENDENT_SELECTION', 'INDEPENDENT_USE'],
    [{ assistanceRevealed: false, interactionKind: 'CONSTRUCTION' as const, structurallyValid: true }, 'INDEPENDENT_CONSTRUCTION', 'INDEPENDENT_USE'],
    [{ assistanceRevealed: false, interactionKind: 'TRANSFER' as const, structurallyValid: true }, 'TRANSFER_APPLICATION', 'INDEPENDENT_TRANSFER'],
    [{ assistanceRevealed: false, interactionKind: 'TRANSFER' as const, structurallyValid: false }, 'TRANSFER_APPLICATION', 'MISAPPLICATION'],
  ])('maps trusted structured interaction deterministically', async (overrides, expectedInteraction, expectedEvidence) => {
    const repository = new MemoryStrategyRepository();
    const recorder = new StrategyRecorder(repository);
    const result = await recorder.record({ ...baseInput, ...overrides }, NOW);

    expect(result.interaction.interactionType).toBe(expectedInteraction);
    expect(result.evidence.type).toBe(expectedEvidence);
  });

  it('is idempotent for exact replay and rejects conflicting id reuse', async () => {
    const repository = new MemoryStrategyRepository();
    const recorder = new StrategyRecorder(repository);

    const first = await recorder.record(baseInput, NOW);
    const replay = await recorder.record(baseInput, NOW);
    expect(replay).toEqual(first);
    expect(await repository.listEvidenceForStudent('student-1', NOW)).toHaveLength(1);

    await expect(recorder.record({ ...baseInput, strategyId: 'STRAT-BAR-COMPARISON' }, NOW))
      .rejects.toThrow('interaction id already exists with different content');
  });
});
