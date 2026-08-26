import type { DailyLessonExecutionStatus, LessonIntent } from '@/lib/planning';
import type { AdaptiveCandidate } from './types';

export interface AdaptiveLessonHistoryFact {
  intent: LessonIntent;
  status: DailyLessonExecutionStatus;
  effective: boolean;
}

function isRemediation(intent: LessonIntent): boolean {
  return intent === 'CORRECTION' || intent === 'REVIEW';
}

export function deriveStarvationGuard(
  history: AdaptiveLessonHistoryFact[],
  candidates: AdaptiveCandidate[],
): boolean {
  if (candidates.some((candidate) =>
    candidate.reason === 'BLOCKING_MISTAKE'
    || (candidate.reason === 'PREREQUISITE_GAP' && candidate.priorityClass === 'MANDATORY'))) {
    return false;
  }

  const latestCompletedEffective = history
    .filter((fact) => fact.effective && fact.status === 'COMPLETED')
    .slice(-2);
  if (latestCompletedEffective.length < 2 || !latestCompletedEffective.every((fact) => isRemediation(fact.intent))) {
    return false;
  }

  return candidates.some((candidate) =>
    candidate.reason === 'CURRENT_OBJECTIVE' || candidate.reason === 'NEXT_READY_OBJECTIVE');
}
