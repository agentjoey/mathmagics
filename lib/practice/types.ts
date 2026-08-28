import type { DifficultyBand } from '@/lib/curriculum';

export interface PracticeSession {
  id: string;
  studentId: string;
  lessonId: string;
  objectiveId: string;
  policyVersion: string;
  createdAt: string;
}

export interface PracticeBlueprint {
  objectiveId: string;
  policyVersion: 'practice-v1';
  slots: DifficultyBand[];
}

export type ArithmeticProblemSpec = {
  kind: 'ARITHMETIC';
  operation: 'MULTIPLY' | 'DIVIDE';
  left: number;
  right: number;
};

export type EquationChoiceProblemSpec = {
  kind: 'EQUATION_CHOICE';
  scenario: 'SHARING' | 'GROUPING' | 'FACT_FAMILY';
  total: number;
  groupSize: number;
  groups: number;
  options: Array<{ id: string; expression: string }>;
  correctOptionId: string;
};

export type NumberSequenceProblemSpec = {
  kind: 'NUMBER_SEQUENCE';
  terms: number[];
  step: number;
  nextValue: number;
};

export type FractionProblemSpec =
  | {
      kind: 'FRACTION_COMPARE';
      leftNumerator: number;
      leftDenominator: number;
      rightNumerator: number;
      rightDenominator: number;
    }
  | {
      kind: 'FRACTION_EQUIVALENT';
      numerator: number;
      denominator: number;
      scaleFactor: number;
      missing: 'NUMERATOR' | 'DENOMINATOR';
    }
  | {
      kind: 'FRACTION_SIMPLIFY';
      numerator: number;
      denominator: number;
    }
  | {
      kind: 'FRACTION_OPERATION';
      operation: 'ADD' | 'SUBTRACT';
      leftNumerator: number;
      leftDenominator: number;
      rightNumerator: number;
      rightDenominator: number;
    };

export interface WordProblemStep {
  operation: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE';
  operands: number[];
  result: number;
}

export type WordProblemSpec = {
  kind: 'WORD_PROBLEM';
  structure: 'EQUAL_GROUPS' | 'SHARING' | 'GROUPING' | 'PART_WHOLE' | 'COMPARISON';
  quantities: Record<string, number>;
  steps: WordProblemStep[];
  answer: number;
  templateId: string;
};

export type PracticeProblemSpec =
  | ArithmeticProblemSpec
  | EquationChoiceProblemSpec
  | NumberSequenceProblemSpec
  | FractionProblemSpec
  | WordProblemSpec;

export type AnswerSpec =
  | { kind: 'INTEGER'; value: string }
  | { kind: 'DECIMAL'; value: string }
  | { kind: 'FRACTION'; numerator: number; denominator: number; equivalence: 'VALUE' | 'EXACT_SIMPLEST' }
  | { kind: 'CHOICE'; optionId: string }
  | { kind: 'EXACT_TEXT'; acceptedValues: string[]; caseSensitive: false };

export interface PracticeItem {
  id: string;
  sessionId: string;
  studentId: string;
  objectiveId: string;
  sequence: number;
  difficultyBand: DifficultyBand;
  problemSpec: PracticeProblemSpec;
  prompt: string;
  answerSpec: AnswerSpec;
  hint?: string;
  solutionOutline: string[];
  generator: string;
  generatorVersion: string;
  createdAt: string;
}

export interface PracticeHintReveal {
  id: string;
  sessionId: string;
  itemId: string;
  studentId: string;
  revealedAt: string;
}

export type AttemptOutcome = 'CORRECT' | 'INCORRECT';

export type AttemptSource =
  | { kind: 'PRACTICE'; sessionId: string; itemId: string }
  | { kind: 'HOMEWORK'; submissionId: string; problemId: string }
  | { kind: 'CORRECTION'; mistakeId: string; correctionItemId: string };

export interface Attempt {
  id: string;
  source: AttemptSource;
  studentId: string;
  objectiveId: string;
  answerText: string;
  outcome: AttemptOutcome;
  hintUsed: boolean;
  retryOfAttemptId?: string;
  gradingPolicyVersion: string;
  submittedAt: string;
  recordedAt: string;
}

export interface SubmitAttemptInput {
  attemptId: string;
  sessionId: string;
  itemId: string;
  answerText: string;
  retryOfAttemptId?: string;
}
