import { describe, expect, it } from 'vitest';
import { deriveStrategyProgress } from '@/lib/strategy/projection';
import type { StrategyEvidence } from '@/lib/strategy/types';

const STRATEGY = 'STRAT-BAR-PART-WHOLE';

function evidence(
  id: string,
  objectiveId: string,
  type: StrategyEvidence['type'],
  observedAt: string,
): StrategyEvidence {
  return {
    id,
    studentId: 'student-1',
    strategyId: STRATEGY,
    objectiveId,
    type,
    interactionId: `interaction-${id}`,
    observedAt,
    recordedAt: observedAt,
  };
}

describe('deriveStrategyProgress', () => {
  it('is NOT_OBSERVED without evidence and DEVELOPING for prompted use', () => {
    expect(deriveStrategyProgress(STRATEGY, []).state).toBe('NOT_OBSERVED');
    expect(deriveStrategyProgress(STRATEGY, [
      evidence('prompted', 'P2-AS-002', 'PROMPTED_USE', '2026-08-26T01:00:00.000Z'),
    ]).state).toBe('DEVELOPING');
  });

  it('does not call repeated independent use on one objective reliable', () => {
    const result = deriveStrategyProgress(STRATEGY, [
      evidence('u1', 'P2-AS-002', 'INDEPENDENT_USE', '2026-08-26T01:00:00.000Z'),
      evidence('u2', 'P2-AS-002', 'INDEPENDENT_USE', '2026-08-26T02:00:00.000Z'),
      evidence('u3', 'P2-AS-002', 'INDEPENDENT_TRANSFER', '2026-08-26T03:00:00.000Z'),
    ]);
    expect(result.state).toBe('DEVELOPING');
    expect(result.objectiveCount).toBe(1);
  });

  it('becomes RELIABLE with three independent facts across two objectives including transfer', () => {
    const result = deriveStrategyProgress(STRATEGY, [
      evidence('u1', 'P2-AS-002', 'INDEPENDENT_USE', '2026-08-26T01:00:00.000Z'),
      evidence('u2', 'P2-MD-005', 'INDEPENDENT_USE', '2026-08-26T02:00:00.000Z'),
      evidence('t1', 'P2-MD-005', 'INDEPENDENT_TRANSFER', '2026-08-26T03:00:00.000Z'),
    ]);
    expect(result.state).toBe('RELIABLE');
    expect(result.independentUseCount).toBe(2);
    expect(result.independentTransferCount).toBe(1);
    expect(result.objectiveCount).toBe(2);
  });

  it('resets RELIABLE qualification after a later MISAPPLICATION', () => {
    const result = deriveStrategyProgress(STRATEGY, [
      evidence('u1', 'P2-AS-002', 'INDEPENDENT_USE', '2026-08-26T01:00:00.000Z'),
      evidence('u2', 'P2-MD-005', 'INDEPENDENT_USE', '2026-08-26T02:00:00.000Z'),
      evidence('t1', 'P2-MD-005', 'INDEPENDENT_TRANSFER', '2026-08-26T03:00:00.000Z'),
      evidence('bad', 'P2-AS-002', 'MISAPPLICATION', '2026-08-26T04:00:00.000Z'),
    ]);
    expect(result.state).toBe('DEVELOPING');
  });

  it('can requalify only from evidence after the latest MISAPPLICATION', () => {
    const result = deriveStrategyProgress(STRATEGY, [
      evidence('old-u', 'P2-AS-002', 'INDEPENDENT_USE', '2026-08-26T01:00:00.000Z'),
      evidence('bad', 'P2-AS-002', 'MISAPPLICATION', '2026-08-26T02:00:00.000Z'),
      evidence('new-u1', 'P2-AS-002', 'INDEPENDENT_USE', '2026-08-26T03:00:00.000Z'),
      evidence('new-u2', 'P2-MD-005', 'INDEPENDENT_USE', '2026-08-26T04:00:00.000Z'),
      evidence('new-t', 'P2-MD-005', 'INDEPENDENT_TRANSFER', '2026-08-26T05:00:00.000Z'),
    ]);
    expect(result.state).toBe('RELIABLE');
    expect(result.qualifyingEvidenceCount).toBe(3);
  });

  it('rejects evidence whose objective does not support the strategy', () => {
    expect(() => deriveStrategyProgress(STRATEGY, [
      evidence('bad-objective', 'P2-AS-001', 'INDEPENDENT_USE', '2026-08-26T01:00:00.000Z'),
    ])).toThrow('does not support strategy');
  });
});
