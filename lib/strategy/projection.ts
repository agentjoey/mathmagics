import type { StrategyEvidence, StrategyProgressSnapshot } from './types';
import { assertValidStrategyEvidence } from './validation';

function orderEvidence(records: StrategyEvidence[]): StrategyEvidence[] {
  return records.slice().sort((left, right) =>
    Date.parse(left.observedAt) - Date.parse(right.observedAt)
    || Date.parse(left.recordedAt) - Date.parse(right.recordedAt)
    || left.id.localeCompare(right.id));
}

export function deriveStrategyProgress(
  strategyId: string,
  evidence: StrategyEvidence[],
): StrategyProgressSnapshot {
  if (!strategyId.trim()) throw new Error('strategyId must be non-empty');

  const ordered = orderEvidence(evidence);
  for (const record of ordered) {
    assertValidStrategyEvidence(record);
    if (record.strategyId !== strategyId) {
      throw new Error(`strategy evidence ${record.id} does not match projected strategy ${strategyId}`);
    }
  }

  if (ordered.length === 0) {
    return {
      strategyId,
      state: 'NOT_OBSERVED',
      evidenceCount: 0,
      qualifyingEvidenceCount: 0,
      independentUseCount: 0,
      independentTransferCount: 0,
      objectiveCount: 0,
      lastObservedAt: null,
    };
  }

  let latestMisapplication = -1;
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index]!.type === 'MISAPPLICATION') latestMisapplication = index;
  }

  const postFailure = ordered.slice(latestMisapplication + 1);
  const qualifying = postFailure.filter((record) =>
    record.type === 'INDEPENDENT_USE' || record.type === 'INDEPENDENT_TRANSFER');
  const independentUseCount = qualifying.filter((record) => record.type === 'INDEPENDENT_USE').length;
  const independentTransferCount = qualifying.filter((record) => record.type === 'INDEPENDENT_TRANSFER').length;
  const objectiveCount = new Set(qualifying.map((record) => record.objectiveId)).size;
  const reliable = qualifying.length >= 3 && objectiveCount >= 2 && independentTransferCount >= 1;

  return {
    strategyId,
    state: reliable ? 'RELIABLE' : 'DEVELOPING',
    evidenceCount: ordered.length,
    qualifyingEvidenceCount: qualifying.length,
    independentUseCount,
    independentTransferCount,
    objectiveCount,
    lastObservedAt: ordered[ordered.length - 1]!.observedAt,
  };
}
