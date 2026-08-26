import { getPrerequisites } from '@/lib/curriculum';
import type { DailyLesson, LessonIntent } from '@/lib/planning';
import type { AdaptiveCandidate, AdaptiveRationaleCode } from './types';

export type AdaptiveRecommendation =
  | {
      action: 'KEEP';
      intent: LessonIntent;
      objectiveIds: string[];
      rationaleCodes: AdaptiveRationaleCode[];
      targetMistakeId?: undefined;
    }
  | {
      action: 'SUPERSEDE';
      intent: Extract<LessonIntent, 'CORRECTION' | 'REVIEW' | 'LEARN' | 'PRACTICE'>;
      objectiveIds: string[];
      rationaleCodes: AdaptiveRationaleCode[];
      targetMistakeId?: string;
    };

function keep(source: DailyLesson, rationaleCodes: AdaptiveRationaleCode[] = ['NO_HIGHER_PRIORITY_NEED']): AdaptiveRecommendation {
  return {
    action: 'KEEP',
    intent: source.intent,
    objectiveIds: [...source.objectiveIds],
    rationaleCodes,
  };
}

function supersede(
  candidate: AdaptiveCandidate,
  rationaleCodes: AdaptiveRationaleCode[] = candidate.rationaleCodes,
): AdaptiveRecommendation {
  return {
    action: 'SUPERSEDE',
    intent: candidate.intent,
    objectiveIds: [candidate.objectiveId],
    rationaleCodes: [...rationaleCodes],
    ...(candidate.targetMistakeId ? { targetMistakeId: candidate.targetMistakeId } : {}),
  };
}

function sameOrDirectPrerequisite(candidateObjectiveId: string, sourceObjectiveId: string | undefined): boolean {
  if (!sourceObjectiveId) return false;
  if (candidateObjectiveId === sourceObjectiveId) return true;
  return getPrerequisites(sourceObjectiveId).some((objective) => objective.id === candidateObjectiveId);
}

function sameLessonChoice(source: DailyLesson, candidate: AdaptiveCandidate): boolean {
  return source.intent === candidate.intent
    && source.objectiveIds.length === 1
    && source.objectiveIds[0] === candidate.objectiveId;
}

export function selectAdaptiveRecommendation(
  source: DailyLesson,
  candidates: AdaptiveCandidate[],
  starvationGuardRequiresForward: boolean,
): AdaptiveRecommendation {
  const top = candidates[0];
  if (!top) return keep(source);

  if (top.reason === 'BLOCKING_MISTAKE') return supersede(top);

  if (top.reason === 'PREREQUISITE_GAP' && top.priorityClass === 'MANDATORY') {
    return supersede(top);
  }

  if (starvationGuardRequiresForward) {
    const forward = candidates.find((candidate) =>
      candidate.reason === 'CURRENT_OBJECTIVE' || candidate.reason === 'NEXT_READY_OBJECTIVE');
    if (!forward) return keep(source, ['STARVATION_GUARD_FORWARD_PROGRESS']);
    const rationaleCodes: AdaptiveRationaleCode[] = [
      'STARVATION_GUARD_FORWARD_PROGRESS',
      ...forward.rationaleCodes.filter((code) => code !== 'STARVATION_GUARD_FORWARD_PROGRESS'),
    ];
    return sameLessonChoice(source, forward)
      ? keep(source, rationaleCodes)
      : supersede(forward, rationaleCodes);
  }

  if (top.reason === 'PREREQUISITE_GAP') {
    if (source.intent === 'LEARN') return supersede(top);
    return keep(source);
  }

  if (top.reason === 'UNRESOLVED_MISTAKE') {
    if (source.intent === 'PRACTICE' || source.intent === 'REVIEW') return supersede(top);
    if (source.intent === 'LEARN' && sameOrDirectPrerequisite(top.objectiveId, source.objectiveIds[0])) {
      return supersede(top);
    }
    return keep(source);
  }

  if (top.reason === 'REVIEW_DUE') {
    if (
      source.intent === 'PRACTICE'
      && source.objectiveIds[0] === top.objectiveId
      && top.rationaleCodes.includes('URGENT_REVIEW')
    ) {
      return supersede(top);
    }
    return keep(source);
  }

  return keep(source);
}
