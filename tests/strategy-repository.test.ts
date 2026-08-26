import { describe, expect, it } from 'vitest';
import { MemoryStrategyRepository } from '@/lib/strategy/memory-repository';
import type { StrategyEvidence, StrategyInteraction } from '@/lib/strategy/types';

const interaction: StrategyInteraction = {
  id: 'interaction-1',
  studentId: 'student-1',
  objectiveId: 'P2-AS-002',
  strategyId: 'STRAT-BAR-PART-WHOLE',
  sourceKind: 'PRACTICE',
  sourceRefId: 'attempt-1',
  interactionType: 'INDEPENDENT_SELECTION',
  outcome: 'VALID',
  observedAt: '2026-08-26T01:00:00.000Z',
  recordedAt: '2026-08-26T01:00:00.000Z',
};

const evidence: StrategyEvidence = {
  id: 'evidence-1',
  studentId: interaction.studentId,
  objectiveId: interaction.objectiveId,
  strategyId: interaction.strategyId,
  type: 'INDEPENDENT_USE',
  interactionId: interaction.id,
  observedAt: interaction.observedAt,
  recordedAt: interaction.recordedAt,
};

describe('MemoryStrategyRepository', () => {
  it('stores defensive clones and filters ordered reads by cutoff', async () => {
    const repository = new MemoryStrategyRepository();
    await repository.appendInteraction(interaction);
    await repository.appendEvidence(evidence);
    await repository.appendInteraction({ ...interaction, id: 'interaction-2', sourceRefId: 'attempt-2', observedAt: '2026-08-26T03:00:00.000Z', recordedAt: '2026-08-26T03:00:00.000Z' });
    await repository.appendEvidence({ ...evidence, id: 'evidence-2', interactionId: 'interaction-2', observedAt: '2026-08-26T03:00:00.000Z', recordedAt: '2026-08-26T03:00:00.000Z' });

    const early = await repository.listEvidenceForStudent('student-1', '2026-08-26T02:00:00.000Z');
    expect(early.map((entry) => entry.id)).toEqual(['evidence-1']);
    early[0]!.type = 'MISAPPLICATION';
    expect((await repository.getEvidenceByInteraction('interaction-1'))?.type).toBe('INDEPENDENT_USE');
  });

  it('accepts exact replay but rejects conflicts and a second evidence for one interaction', async () => {
    const repository = new MemoryStrategyRepository();
    await repository.appendInteraction(interaction);
    await repository.appendInteraction(structuredClone(interaction));
    await repository.appendEvidence(evidence);
    await repository.appendEvidence(structuredClone(evidence));

    await expect(repository.appendInteraction({ ...interaction, objectiveId: 'P2-MD-005' }))
      .rejects.toThrow('interaction id already exists with different content');
    await expect(repository.appendEvidence({ ...evidence, id: 'evidence-other', type: 'MISAPPLICATION' }))
      .rejects.toThrow('strategy evidence already exists for interaction');
  });
});
