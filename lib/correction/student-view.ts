import { getMisconceptions } from '@/lib/curriculum';
import type { DiagnosisTarget, MistakeState } from './types';

export interface StudentMistakeProjectionInput {
  mistakeId: string;
  objectiveId: string;
  state: MistakeState;
  diagnosisTarget: DiagnosisTarget | null;
  problemPrompt: string;
  hasCorrectedEvidence: boolean;
  hasIndependentExplanation: boolean;
  hasPreparedTransfer: boolean;
  lastObservedAt: string;
}

export interface StudentMistakeView {
  mistakeId: string;
  objectiveId: string;
  status: 'NEEDS_REVIEW' | 'READY_TO_CORRECT' | 'IN_CORRECTION';
  problemPrompt: string;
  diagnosisLabel: string;
  nextStep: 'CONFIRM_DIAGNOSIS' | 'RETRY' | 'REASON' | 'TRANSFER';
  lastObservedAt: string;
}

const GENERIC_LABELS: Record<Extract<DiagnosisTarget, { kind: 'GENERIC' }>['code'], string> = {
  FACT_ERROR: 'Fact recall error',
  PROCEDURE_ERROR: 'Procedure error',
  REPRESENTATION_ERROR: 'Representation error',
  UNKNOWN: 'Needs review',
};

export function diagnosisLabel(objectiveId: string, target: DiagnosisTarget | null): string {
  if (!target) return 'Needs review';
  if (target.kind === 'GENERIC') return GENERIC_LABELS[target.code];
  const misconception = getMisconceptions(objectiveId)
    .find((candidate) => candidate.id === target.misconceptionId);
  if (!misconception) throw new Error(`Unknown misconception for objective ${objectiveId}: ${target.misconceptionId}`);
  return misconception.name;
}

export function toStudentMistakeView(input: StudentMistakeProjectionInput): StudentMistakeView {
  if (input.state === 'RESOLVED') throw new Error('resolved Mistakes are not part of the active student correction view');

  let status: StudentMistakeView['status'];
  let nextStep: StudentMistakeView['nextStep'];
  if (input.state === 'OBSERVED') {
    status = 'NEEDS_REVIEW';
    nextStep = 'CONFIRM_DIAGNOSIS';
  } else if (input.state === 'CONFIRMED') {
    status = 'READY_TO_CORRECT';
    nextStep = 'RETRY';
  } else {
    status = 'IN_CORRECTION';
    if (!input.hasCorrectedEvidence) nextStep = 'RETRY';
    else if (!input.hasIndependentExplanation) nextStep = 'REASON';
    else nextStep = 'TRANSFER';
  }

  return {
    mistakeId: input.mistakeId,
    objectiveId: input.objectiveId,
    status,
    problemPrompt: input.problemPrompt,
    diagnosisLabel: diagnosisLabel(input.objectiveId, input.diagnosisTarget),
    nextStep,
    lastObservedAt: input.lastObservedAt,
  };
}
