import { loadCurriculumDataset } from '@/lib/curriculum';
import type { DiagnosisTarget, MisconceptionSummary } from './types';

export interface ParentMistakeSummaryView {
  studentId: string;
  diagnosisTarget: DiagnosisTarget;
  label: string;
  activeEpisodeCount: number;
  resolvedEpisodeCount: number;
  recurrenceCount: number;
  linkedIncorrectObservationCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface ParentMistakeGroups {
  active: ParentMistakeSummaryView[];
  resolved: ParentMistakeSummaryView[];
  recurring: ParentMistakeSummaryView[];
}

const GENERIC_LABELS: Record<Extract<DiagnosisTarget, { kind: 'GENERIC' }>['code'], string> = {
  FACT_ERROR: 'Fact recall error',
  PROCEDURE_ERROR: 'Procedure error',
  REPRESENTATION_ERROR: 'Representation error',
  UNKNOWN: 'Needs review',
};

function labelFor(target: DiagnosisTarget): string {
  if (target.kind === 'GENERIC') return GENERIC_LABELS[target.code];
  const misconception = loadCurriculumDataset().misconceptions
    .find((candidate) => candidate.id === target.misconceptionId);
  if (!misconception) throw new Error(`Unknown misconception id: ${target.misconceptionId}`);
  return misconception.name;
}

function project(summary: MisconceptionSummary): ParentMistakeSummaryView {
  return {
    studentId: summary.studentId,
    diagnosisTarget: structuredClone(summary.target),
    label: labelFor(summary.target),
    activeEpisodeCount: summary.activeEpisodeCount,
    resolvedEpisodeCount: summary.resolvedEpisodeCount,
    recurrenceCount: summary.recurrenceCount,
    linkedIncorrectObservationCount: summary.linkedIncorrectObservationCount,
    firstObservedAt: summary.firstObservedAt,
    lastObservedAt: summary.lastObservedAt,
  };
}

function order(left: ParentMistakeSummaryView, right: ParentMistakeSummaryView): number {
  return left.label.localeCompare(right.label) || left.lastObservedAt.localeCompare(right.lastObservedAt);
}

export function toParentMistakeGroups(summaries: MisconceptionSummary[]): ParentMistakeGroups {
  const projected = summaries.map(project);
  return {
    active: projected.filter((entry) => entry.activeEpisodeCount > 0).sort(order),
    resolved: projected.filter((entry) => entry.resolvedEpisodeCount > 0).sort(order),
    recurring: projected.filter((entry) => entry.recurrenceCount > 0).sort(order),
  };
}
