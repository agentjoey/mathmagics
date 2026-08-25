import type {
  AnswerSpec,
  Attempt,
  PracticeHintReveal,
  PracticeItem,
  PracticeProblemSpec,
  PracticeSession,
  WordProblemStep,
} from './types';

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date-time string`);
}

function requireFinite(values: number[]): void {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('practice problem numeric parameters must be finite');
  }
}

function requirePositiveDenominators(values: number[]): void {
  if (values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('fraction denominators must be positive integers');
  }
}

function evaluateStep(step: WordProblemStep): number {
  if (step.operands.length < 2) throw new Error('word problem step operands must contain at least two values');
  requireFinite([...step.operands, step.result]);
  const [first, ...rest] = step.operands;
  switch (step.operation) {
    case 'ADD': return rest.reduce((value, operand) => value + operand, first!);
    case 'SUBTRACT': return rest.reduce((value, operand) => value - operand, first!);
    case 'MULTIPLY': return rest.reduce((value, operand) => value * operand, first!);
    case 'DIVIDE': return rest.reduce((value, operand) => value / operand, first!);
  }
}

function assertValidProblemSpec(spec: PracticeProblemSpec): void {
  switch (spec.kind) {
    case 'ARITHMETIC':
      requireFinite([spec.left, spec.right]);
      if (spec.operation === 'DIVIDE' && spec.right === 0) throw new Error('division divisor must be non-zero');
      return;
    case 'EQUATION_CHOICE': {
      requireFinite([spec.total, spec.groupSize, spec.groups]);
      if (spec.options.length === 0) throw new Error('equation choice options must be non-empty');
      const ids = spec.options.map((option) => option.id);
      if (ids.some((id) => !id.trim()) || spec.options.some((option) => !option.expression.trim())) {
        throw new Error('equation choice options must be non-empty');
      }
      if (new Set(ids).size !== ids.length) throw new Error('equation choice option ids must be unique');
      if (!ids.includes(spec.correctOptionId)) throw new Error('equation choice correctOptionId must reference an option');
      return;
    }
    case 'FRACTION_COMPARE':
      requireFinite([spec.leftNumerator, spec.leftDenominator, spec.rightNumerator, spec.rightDenominator]);
      requirePositiveDenominators([spec.leftDenominator, spec.rightDenominator]);
      return;
    case 'FRACTION_EQUIVALENT':
      requireFinite([spec.numerator, spec.denominator, spec.scaleFactor]);
      requirePositiveDenominators([spec.denominator]);
      if (!Number.isInteger(spec.scaleFactor) || spec.scaleFactor <= 0) throw new Error('fraction scaleFactor must be a positive integer');
      return;
    case 'FRACTION_SIMPLIFY':
      requireFinite([spec.numerator, spec.denominator]);
      requirePositiveDenominators([spec.denominator]);
      return;
    case 'FRACTION_OPERATION':
      requireFinite([spec.leftNumerator, spec.leftDenominator, spec.rightNumerator, spec.rightDenominator]);
      requirePositiveDenominators([spec.leftDenominator, spec.rightDenominator]);
      return;
    case 'WORD_PROBLEM': {
      requireNonEmpty(spec.templateId, 'word problem templateId');
      requireFinite([...Object.values(spec.quantities), spec.answer]);
      if (spec.steps.length === 0) throw new Error('word problem steps must be non-empty');
      for (const step of spec.steps) {
        const stepResult = evaluateStep(step);
        if (!Number.isFinite(stepResult) || stepResult !== step.result) {
          throw new Error('word problem step result must match its operation and operands');
        }
      }
      if (spec.answer !== spec.steps[spec.steps.length - 1]!.result) {
        throw new Error('word problem answer must equal final step result');
      }
      return;
    }
  }
}

function assertValidAnswerSpec(spec: AnswerSpec): void {
  switch (spec.kind) {
    case 'INTEGER':
      if (!/^[+-]?\d+$/u.test(spec.value.trim())) {
        throw new Error('integer answer spec value must be valid integer syntax');
      }
      return;
    case 'DECIMAL':
      if (!/^[+-]?\d+(?:\.\d+)?$/u.test(spec.value.trim())) {
        throw new Error('decimal answer spec value must be valid decimal syntax');
      }
      return;
    case 'FRACTION':
      requireFinite([spec.numerator, spec.denominator]);
      if (!Number.isInteger(spec.numerator)) throw new Error('fraction answer numerator must be an integer');
      requirePositiveDenominators([spec.denominator]);
      return;
    case 'CHOICE':
      requireNonEmpty(spec.optionId, 'answer spec optionId');
      return;
    case 'EXACT_TEXT':
      if (spec.acceptedValues.length === 0 || spec.acceptedValues.some((value) => !value.trim())) {
        throw new Error('answer spec acceptedValues must be non-empty');
      }
  }
}

export function assertValidPracticeSession(session: PracticeSession): void {
  requireNonEmpty(session.id, 'practice session id');
  requireNonEmpty(session.studentId, 'practice session studentId');
  requireNonEmpty(session.lessonId, 'practice session lessonId');
  requireNonEmpty(session.objectiveId, 'practice session objectiveId');
  requireNonEmpty(session.policyVersion, 'practice session policyVersion');
  requireTimestamp(session.createdAt, 'practice session createdAt');
}

export function assertValidPracticeItem(item: PracticeItem): void {
  requireNonEmpty(item.id, 'practice item id');
  requireNonEmpty(item.sessionId, 'practice item sessionId');
  requireNonEmpty(item.studentId, 'practice item studentId');
  requireNonEmpty(item.objectiveId, 'practice item objectiveId');
  if (!Number.isInteger(item.sequence) || item.sequence <= 0) throw new Error('practice item sequence must be a positive integer');
  requireNonEmpty(item.prompt, 'practice item prompt');
  if (item.solutionOutline.length === 0 || item.solutionOutline.some((line) => !line.trim())) {
    throw new Error('practice item solutionOutline must be non-empty');
  }
  requireNonEmpty(item.generator, 'practice item generator');
  requireNonEmpty(item.generatorVersion, 'practice item generatorVersion');
  requireTimestamp(item.createdAt, 'practice item createdAt');
  assertValidProblemSpec(item.problemSpec);
  assertValidAnswerSpec(item.answerSpec);
}

export function assertValidPracticeHintReveal(reveal: PracticeHintReveal): void {
  requireNonEmpty(reveal.id, 'practice hint reveal id');
  requireNonEmpty(reveal.sessionId, 'practice hint reveal sessionId');
  requireNonEmpty(reveal.itemId, 'practice hint reveal itemId');
  requireNonEmpty(reveal.studentId, 'practice hint reveal studentId');
  requireTimestamp(reveal.revealedAt, 'practice hint reveal revealedAt');
}

export function assertValidAttempt(attempt: Attempt): void {
  requireNonEmpty(attempt.id, 'attempt id');
  if (attempt.source.kind === 'PRACTICE') {
    requireNonEmpty(attempt.source.sessionId, 'attempt practice sessionId');
    requireNonEmpty(attempt.source.itemId, 'attempt practice itemId');
  } else if (attempt.source.kind === 'HOMEWORK') {
    requireNonEmpty(attempt.source.submissionId, 'attempt homework submissionId');
    requireNonEmpty(attempt.source.problemId, 'attempt homework problemId');
  } else {
    throw new Error('attempt source kind must be PRACTICE or HOMEWORK');
  }
  requireNonEmpty(attempt.studentId, 'attempt studentId');
  requireNonEmpty(attempt.objectiveId, 'attempt objectiveId');
  requireNonEmpty(attempt.answerText, 'attempt answerText');
  requireNonEmpty(attempt.gradingPolicyVersion, 'attempt gradingPolicyVersion');
  requireTimestamp(attempt.submittedAt, 'attempt submittedAt');
  requireTimestamp(attempt.recordedAt, 'attempt recordedAt');
  if (Date.parse(attempt.recordedAt) < Date.parse(attempt.submittedAt)) {
    throw new Error('attempt recordedAt must not precede submittedAt');
  }
  if (attempt.retryOfAttemptId === attempt.id) throw new Error('attempt retryOfAttemptId must not equal attempt id');
}
