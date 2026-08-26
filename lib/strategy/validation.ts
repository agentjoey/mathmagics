import { getLearningObjective } from '@/lib/curriculum';
import type { StrategyEvidence, StrategyInteraction } from './types';

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO date-time string`);
  }
}

function requireChronology(observedAt: string, recordedAt: string, prefix: string): void {
  requireTimestamp(observedAt, `${prefix} observedAt`);
  requireTimestamp(recordedAt, `${prefix} recordedAt`);
  if (Date.parse(recordedAt) < Date.parse(observedAt)) {
    throw new Error(`${prefix} recordedAt must not precede observedAt`);
  }
}

export function assertObjectiveSupportsStrategy(objectiveId: string, strategyId: string): void {
  const objective = getLearningObjective(objectiveId);
  if (!objective.strategyIds.includes(strategyId)) {
    throw new Error(`objective ${objectiveId} does not support strategy ${strategyId}`);
  }
}

export function assertValidStrategyInteraction(interaction: StrategyInteraction): void {
  requireNonEmpty(interaction.id, 'strategy interaction id');
  requireNonEmpty(interaction.studentId, 'strategy interaction studentId');
  requireNonEmpty(interaction.strategyId, 'strategy interaction strategyId');
  requireNonEmpty(interaction.objectiveId, 'strategy interaction objectiveId');
  requireNonEmpty(interaction.sourceRefId, 'strategy interaction sourceRefId');
  requireChronology(interaction.observedAt, interaction.recordedAt, 'strategy interaction');
  assertObjectiveSupportsStrategy(interaction.objectiveId, interaction.strategyId);
}

export function assertValidStrategyEvidence(evidence: StrategyEvidence): void {
  requireNonEmpty(evidence.id, 'strategy evidence id');
  requireNonEmpty(evidence.studentId, 'strategy evidence studentId');
  requireNonEmpty(evidence.strategyId, 'strategy evidence strategyId');
  requireNonEmpty(evidence.objectiveId, 'strategy evidence objectiveId');
  requireNonEmpty(evidence.interactionId, 'strategy evidence interactionId');
  requireChronology(evidence.observedAt, evidence.recordedAt, 'strategy evidence');
  assertObjectiveSupportsStrategy(evidence.objectiveId, evidence.strategyId);
}
