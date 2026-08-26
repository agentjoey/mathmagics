import { getLearningObjective } from '@/lib/curriculum';
import type {
  CorrectionItem,
  CorrectionReasoningCheck,
  DiagnosisTarget,
  GenericDiagnosisCode,
  Mistake,
  MistakeEvent,
} from './types';

const GENERIC_CODES = new Set<GenericDiagnosisCode>([
  'FACT_ERROR',
  'PROCEDURE_ERROR',
  'REPRESENTATION_ERROR',
  'UNKNOWN',
]);

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO date-time string`);
  }
}

export function assertValidDiagnosisTarget(objectiveId: string, target: DiagnosisTarget): void {
  const objective = getLearningObjective(objectiveId);
  if (target.kind === 'GENERIC') {
    if (!GENERIC_CODES.has(target.code)) throw new Error('invalid generic diagnosis code');
    return;
  }
  if (!objective.misconceptionIds.includes(target.misconceptionId)) {
    throw new Error(`diagnosis target is not allowed for objective ${objectiveId}`);
  }
}

export function assertValidMistake(mistake: Mistake): void {
  const candidate = mistake as Mistake & Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(candidate, 'state')) {
    throw new Error('mistake must not contain mutable state');
  }
  requireNonEmpty(mistake.id, 'mistake id');
  requireNonEmpty(mistake.studentId, 'mistake studentId');
  requireNonEmpty(mistake.objectiveId, 'mistake objectiveId');
  requireNonEmpty(mistake.initialAttemptId, 'mistake initialAttemptId');
  if (mistake.diagnosisPolicyVersion !== 'mistake-diagnosis-v1') {
    throw new Error('mistake diagnosisPolicyVersion must be mistake-diagnosis-v1');
  }
  requireTimestamp(mistake.firstObservedAt, 'mistake firstObservedAt');
  requireTimestamp(mistake.createdAt, 'mistake createdAt');
  assertValidDiagnosisTarget(mistake.objectiveId, mistake.initialDiagnosisTarget);
}

export function assertValidMistakeEvent(mistake: Mistake, event: MistakeEvent): void {
  requireNonEmpty(event.id, 'mistake event id');
  if (event.mistakeId !== mistake.id) throw new Error('mistake event coordinates must match mistake');
  requireNonEmpty(event.policyVersion, 'mistake event policyVersion');
  requireTimestamp(event.occurredAt, 'mistake event occurredAt');
}

export function assertValidCorrectionItem(mistake: Mistake, item: CorrectionItem): void {
  requireNonEmpty(item.id, 'correction item id');
  if (
    item.mistakeId !== mistake.id ||
    item.studentId !== mistake.studentId ||
    item.objectiveId !== mistake.objectiveId
  ) {
    throw new Error('correction item coordinates must match mistake');
  }
  requireNonEmpty(item.sourceAttemptId, 'correction item sourceAttemptId');
  requireNonEmpty(item.prompt, 'correction item prompt');
  requireNonEmpty(item.generator, 'correction item generator');
  requireNonEmpty(item.generatorVersion, 'correction item generatorVersion');
  requireTimestamp(item.createdAt, 'correction item createdAt');
  if (item.kind === 'ORIGINAL_RETRY') {
    if (item.transferRound !== undefined) throw new Error('original retry must not define transferRound');
  } else if (!Number.isInteger(item.transferRound) || (item.transferRound ?? 0) <= 0) {
    throw new Error('transferRound must be a positive integer');
  }
}

export function assertValidCorrectionReasoningCheck(
  mistake: Mistake,
  check: CorrectionReasoningCheck,
): void {
  requireNonEmpty(check.id, 'reasoning check id');
  if (
    check.mistakeId !== mistake.id ||
    check.studentId !== mistake.studentId ||
    check.objectiveId !== mistake.objectiveId
  ) {
    throw new Error('reasoning check coordinates must match mistake');
  }
  if (check.policyVersion !== 'correction-reasoning-v1') {
    throw new Error('reasoning check policyVersion must be correction-reasoning-v1');
  }
  requireTimestamp(check.submittedAt, 'reasoning check submittedAt');
  requireTimestamp(check.recordedAt, 'reasoning check recordedAt');
}
