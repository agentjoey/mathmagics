import { getLearningObjective } from '@/lib/curriculum';
import type {
  DeterministicDiagnosisResult,
  DiagnosisTarget,
  GenericDiagnosisCode,
  TrustedAttemptProblem,
} from './types';

const GENERIC_CODES: GenericDiagnosisCode[] = [
  'FACT_ERROR',
  'PROCEDURE_ERROR',
  'REPRESENTATION_ERROR',
  'UNKNOWN',
];

export function allowedDiagnosisTargets(objectiveId: string): DiagnosisTarget[] {
  const objective = getLearningObjective(objectiveId);
  return [
    ...objective.misconceptionIds.map((misconceptionId) => ({
      kind: 'MISCONCEPTION' as const,
      misconceptionId,
    })),
    ...GENERIC_CODES.map((code) => ({ kind: 'GENERIC' as const, code })),
  ];
}

function hasMisconception(allowedTargets: DiagnosisTarget[], misconceptionId: string): boolean {
  return allowedTargets.some(
    (target) => target.kind === 'MISCONCEPTION' && target.misconceptionId === misconceptionId,
  );
}

function oppositeComparison(symbol: string): string | null {
  if (symbol === '<') return '>';
  if (symbol === '>') return '<';
  return null;
}

function diagnoseUnitFractionDenominatorSize(
  problem: TrustedAttemptProblem,
  allowedTargets: DiagnosisTarget[],
): DiagnosisTarget | null {
  const spec = problem.problemSpec;
  const answer = problem.answerSpec;
  if (
    spec.kind !== 'FRACTION_COMPARE'
    || answer.kind !== 'EXACT_TEXT'
    || spec.leftNumerator !== 1
    || spec.rightNumerator !== 1
    || spec.leftDenominator === spec.rightDenominator
    || answer.acceptedValues.length !== 1
    || !hasMisconception(allowedTargets, 'MIS-FRA-DENOMINATOR-SIZE')
  ) {
    return null;
  }

  const expected = answer.acceptedValues[0]!.trim();
  const reversed = oppositeComparison(expected);
  if (!reversed || problem.attempt.answerText.trim() !== reversed) return null;

  const denominatorComparison = spec.leftDenominator > spec.rightDenominator ? '>' : '<';
  if (reversed !== denominatorComparison) return null;

  return {
    kind: 'MISCONCEPTION',
    misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE',
  };
}

function diagnoseMultiplicationFactRetrieval(
  problem: TrustedAttemptProblem,
  allowedTargets: DiagnosisTarget[],
): DiagnosisTarget | null {
  const spec = problem.problemSpec;
  const answer = problem.answerSpec;
  if (
    !['P2-MD-001', 'P2-MD-006'].includes(problem.attempt.objectiveId)
    || spec.kind !== 'ARITHMETIC'
    || spec.operation !== 'MULTIPLY'
    || answer.kind !== 'INTEGER'
    || !hasMisconception(allowedTargets, 'MIS-MD-FACT-RETRIEVAL')
  ) {
    return null;
  }

  const submitted = problem.attempt.answerText.trim();
  if (!/^-?\d+$/u.test(submitted) || submitted === answer.value) return null;

  return {
    kind: 'MISCONCEPTION',
    misconceptionId: 'MIS-MD-FACT-RETRIEVAL',
  };
}

export function diagnoseDeterministically(
  problem: TrustedAttemptProblem,
): DeterministicDiagnosisResult {
  if (problem.attempt.outcome !== 'INCORRECT') {
    throw new Error('deterministic mistake diagnosis requires an incorrect attempt');
  }

  const allowedTargets = allowedDiagnosisTargets(problem.attempt.objectiveId);
  const provenTargets: DiagnosisTarget[] = [];
  const observations: string[] = [];

  const denominatorSize = diagnoseUnitFractionDenominatorSize(problem, allowedTargets);
  if (denominatorSize) {
    provenTargets.push(denominatorSize);
    observations.push('student reversed a unit-fraction comparison in the same direction as denominator magnitude');
  }

  const factRetrieval = diagnoseMultiplicationFactRetrieval(problem, allowedTargets);
  if (factRetrieval) {
    provenTargets.push(factRetrieval);
    observations.push('student supplied an incorrect numeric product for a multiplication-fact objective');
  }

  if (provenTargets.length === 0) {
    observations.push('typed problem and response do not prove a unique supported diagnosis');
  }

  return { allowedTargets, provenTargets, observations };
}
