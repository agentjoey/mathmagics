import type { AdaptiveDecision, AdaptiveRationaleCode, LessonSupersession } from './types';

const RATIONALE_CODES = new Set<AdaptiveRationaleCode>([
  'BLOCKING_MISTAKE', 'RECURRENT_MISTAKE', 'PREREQUISITE_GAP', 'URGENT_REVIEW', 'REVIEW_DUE',
  'PERFORMANCE_STRUGGLING', 'STRATEGY_DEVELOPMENT_NEEDED', 'CURRENT_OBJECTIVE_NOT_MASTERED',
  'NEXT_OBJECTIVE_READY', 'STARVATION_GUARD_FORWARD_PROGRESS', 'NO_HIGHER_PRIORITY_NEED',
  'SOURCE_LESSON_ALREADY_STARTED', 'REPLACEMENT_LESSON_IMMUTABLE',
]);

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date-time string`);
}

export function adaptiveEvaluationKey(decision: Pick<AdaptiveDecision, 'studentId' | 'sourceLessonId' | 'inputFactCutoff' | 'policyVersion'>): string {
  return JSON.stringify([decision.studentId, decision.sourceLessonId, decision.inputFactCutoff, decision.policyVersion]);
}

export function assertValidAdaptiveDecision(decision: AdaptiveDecision): void {
  requireNonEmpty(decision.id, 'adaptive decision id');
  requireNonEmpty(decision.studentId, 'adaptive decision studentId');
  requireNonEmpty(decision.sourceLessonId, 'adaptive decision sourceLessonId');
  if (decision.action !== 'KEEP' && decision.action !== 'SUPERSEDE') throw new Error('invalid adaptive decision action');
  if (decision.policyVersion !== 'adaptive-policy-v1') throw new Error('adaptive decision policyVersion must be adaptive-policy-v1');
  if (decision.selectedObjectiveIds.length < 1 || decision.selectedObjectiveIds.length > 2 || new Set(decision.selectedObjectiveIds).size !== decision.selectedObjectiveIds.length || decision.selectedObjectiveIds.some((id) => !id.trim())) {
    throw new Error('adaptive selectedObjectiveIds must contain one or two unique objective ids');
  }
  if (decision.rationaleCodes.length < 1 || decision.rationaleCodes.some((code) => !RATIONALE_CODES.has(code))) {
    throw new Error('adaptive decision rationaleCodes must be non-empty and supported');
  }
  if (decision.selectedIntent === 'CORRECTION' && !decision.targetMistakeId?.trim()) {
    throw new Error('CORRECTION adaptive decision requires targetMistakeId');
  }
  if (decision.selectedIntent !== 'CORRECTION' && decision.targetMistakeId !== undefined) {
    throw new Error('non-CORRECTION adaptive decision must not define targetMistakeId');
  }
  requireTimestamp(decision.evaluatedAt, 'adaptive decision evaluatedAt');
  requireTimestamp(decision.inputFactCutoff, 'adaptive decision inputFactCutoff');
  requireTimestamp(decision.createdAt, 'adaptive decision createdAt');
  if (decision.evaluatedAt !== decision.inputFactCutoff) throw new Error('adaptive evaluatedAt must equal inputFactCutoff in v1');
  if (Date.parse(decision.createdAt) < Date.parse(decision.evaluatedAt)) throw new Error('adaptive decision createdAt must not precede evaluatedAt');
}

export function assertValidLessonSupersession(supersession: LessonSupersession): void {
  requireNonEmpty(supersession.id, 'lesson supersession id');
  requireNonEmpty(supersession.studentId, 'lesson supersession studentId');
  requireNonEmpty(supersession.sourceLessonId, 'lesson supersession sourceLessonId');
  requireNonEmpty(supersession.replacementLessonId, 'lesson supersession replacementLessonId');
  requireNonEmpty(supersession.adaptiveDecisionId, 'lesson supersession adaptiveDecisionId');
  requireTimestamp(supersession.createdAt, 'lesson supersession createdAt');
  if (supersession.sourceLessonId === supersession.replacementLessonId) throw new Error('source and replacement lesson ids must differ');
}
