import type {
  EffectiveHomeworkObservation,
  ExtractedField,
  HomeworkConfirmation,
  HomeworkProblemExtraction,
  HomeworkTrustEvaluation,
  HomeworkTrustState,
} from './types';

const CONFIDENCE_THRESHOLD = 0.98;
const SIMPLE_FIELDS = new Set(['question', 'answer']);
const STRUCTURED_PREFIX = 'structured.';

function trustedReplacement<T>(field: ExtractedField<T>, value: T): ExtractedField<T> {
  return { ...field, value, confidence: 1 };
}

function validateConfirmation(extraction: HomeworkProblemExtraction, confirmation: HomeworkConfirmation): void {
  if (confirmation.problemId !== extraction.id || confirmation.studentId !== extraction.studentId) {
    throw new Error('homework confirmation coordinates must match problem');
  }
  if (confirmation.policyVersion !== 'homework-confidence-v1') {
    throw new Error('homework confirmation policyVersion must be homework-confidence-v1');
  }
  if (!confirmation.confirmedAt || Number.isNaN(Date.parse(confirmation.confirmedAt))) {
    throw new Error('homework confirmation confirmedAt must be a valid ISO date-time string');
  }
  for (const key of Object.keys(confirmation.corrections)) {
    const structured = key.startsWith(STRUCTURED_PREFIX)
      && key.length > STRUCTURED_PREFIX.length
      && extraction.structured.fields[key.slice(STRUCTURED_PREFIX.length)] !== undefined;
    const simple = SIMPLE_FIELDS.has(key) && (key !== 'answer' || extraction.answer !== undefined);
    if (!simple && !structured) throw new Error('homework confirmation correction field is not allowed');
  }
}

export function deriveEffectiveHomeworkObservation(
  extraction: HomeworkProblemExtraction,
  confirmations: HomeworkConfirmation[],
): EffectiveHomeworkObservation {
  const effective: EffectiveHomeworkObservation = {
    ...extraction,
    question: { ...extraction.question },
    answer: extraction.answer ? { ...extraction.answer } : undefined,
    structured: {
      ...extraction.structured,
      fields: Object.fromEntries(Object.entries(extraction.structured.fields).map(([key, value]) => [key, { ...value }])),
    },
  };

  const ordered = confirmations.slice().sort((left, right) => (
    left.confirmedAt.localeCompare(right.confirmedAt) || left.id.localeCompare(right.id)
  ));

  for (const confirmation of ordered) {
    validateConfirmation(extraction, confirmation);
    for (const [key, value] of Object.entries(confirmation.corrections)) {
      if (key === 'question') effective.question = trustedReplacement(effective.question, value);
      else if (key === 'answer' && effective.answer) effective.answer = trustedReplacement(effective.answer, value);
      else if (key.startsWith(STRUCTURED_PREFIX)) {
        const fieldName = key.slice(STRUCTURED_PREFIX.length);
        const current = effective.structured.fields[fieldName];
        if (current) effective.structured.fields[fieldName] = trustedReplacement(current, value);
      }
    }
  }

  return effective;
}

export function deriveHomeworkTrustState(
  observation: EffectiveHomeworkObservation,
  evaluation: HomeworkTrustEvaluation,
): HomeworkTrustState {
  if (!evaluation.conversionSupported || evaluation.objectiveCandidateCount !== 1) return 'UNSUPPORTED';
  if (!observation.answer || observation.answer.confidence < CONFIDENCE_THRESHOLD) return 'NEEDS_CONFIRMATION';
  const structuralFields = Object.values(observation.structured.fields);
  if (structuralFields.length === 0 || structuralFields.some((field) => field.confidence < CONFIDENCE_THRESHOLD)) {
    return 'NEEDS_CONFIRMATION';
  }
  return 'CONFIRMED';
}

export const HOMEWORK_CONFIDENCE_POLICY_VERSION = 'homework-confidence-v1' as const;
export const HOMEWORK_CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD;
