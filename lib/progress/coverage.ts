import type { EvidenceRecord } from '@/lib/learning';
import type { Attempt } from '@/lib/practice';
import type { CoverageState } from './types';

export interface CompletedLearnLessonFact {
  lessonId: string;
  objectiveIds: string[];
}

export interface CoverageInput {
  objectiveId: string;
  evidence: EvidenceRecord[];
  rootAttempts: Attempt[];
  completedLearnLessons: CompletedLearnLessonFact[];
}

export function deriveCoverage(input: CoverageInput): CoverageState {
  const rootAttempts = input.rootAttempts.filter((attempt) =>
    attempt.objectiveId === input.objectiveId &&
    (attempt.source.kind === 'PRACTICE' || attempt.source.kind === 'HOMEWORK'));
  const rootIds = new Set(rootAttempts.map((attempt) => attempt.id));
  const practised = input.evidence.some((record) =>
    record.objectiveId === input.objectiveId &&
    record.origin.refId !== undefined &&
    rootIds.has(record.origin.refId) &&
    (record.origin.kind === 'PRACTICE' || record.origin.kind === 'HOMEWORK'));
  if (practised) return 'PRACTISED';
  if (rootAttempts.length > 0) return 'ENGAGED';
  const introduced = input.evidence.some((record) =>
    record.objectiveId === input.objectiveId && record.type === 'introduced');
  const completedLearn = input.completedLearnLessons.some((lesson) =>
    lesson.objectiveIds.includes(input.objectiveId));
  if (introduced || completedLearn) return 'INTRODUCED';
  return 'NOT_SEEN';
}
