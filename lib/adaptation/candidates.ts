import type { MasteryState, ReadinessState } from '@/lib/learning';
import type { PerformanceState } from '@/lib/progress';
import type { AdaptiveCandidate, MistakePriority } from './types';

export interface AdaptiveMistakeNeed {
  mistakeId: string;
  objectiveId: string;
  priority: MistakePriority;
  recurrent: boolean;
}

export interface AdaptivePrerequisiteNeed {
  objectiveId: string;
  mastery: MasteryState;
  reviewDue: boolean;
  targetObjectiveId: string;
  targetReadiness: Extract<ReadinessState, 'NEEDS_SUPPORT' | 'BLOCKED'>;
}

export interface AdaptiveReviewNeed {
  objectiveId: string;
  mastery: 'MASTERED';
  reviewDue: true;
  performance: PerformanceState;
}

export interface AdaptiveCurrentNeed {
  objectiveId: string;
  mastery: Exclude<MasteryState, 'MASTERED'>;
  reviewDue: boolean;
  performance: PerformanceState;
  strategyNeedsDevelopment?: boolean;
}

export interface AdaptiveNextNeed {
  objectiveId: string;
  mastery: MasteryState;
  reviewDue: boolean;
  readiness: ReadinessState;
  performance?: PerformanceState;
  strategyNeedsDevelopment?: boolean;
}

export interface AdaptiveCandidateInput {
  mistakes: AdaptiveMistakeNeed[];
  prerequisites: AdaptivePrerequisiteNeed[];
  reviews: AdaptiveReviewNeed[];
  current?: AdaptiveCurrentNeed;
  next: AdaptiveNextNeed[];
}

const REASON_RANK: Record<AdaptiveCandidate['reason'], number> = {
  BLOCKING_MISTAKE: 0,
  PREREQUISITE_GAP: 1,
  UNRESOLVED_MISTAKE: 2,
  REVIEW_DUE: 3,
  PERFORMANCE_STRUGGLING: 4,
  CURRENT_OBJECTIVE: 4,
  NEXT_READY_OBJECTIVE: 5,
};

function practiceRationale(
  performance: PerformanceState | undefined,
  strategyNeedsDevelopment: boolean | undefined,
): AdaptiveCandidate['rationaleCodes'] {
  const codes: AdaptiveCandidate['rationaleCodes'] = [];
  if (performance === 'STRUGGLING') codes.push('PERFORMANCE_STRUGGLING');
  if (strategyNeedsDevelopment) codes.push('STRATEGY_DEVELOPMENT_NEEDED');
  return codes;
}

function intentForDevelopingState(mastery: MasteryState): 'LEARN' | 'PRACTICE' | null {
  if (mastery === 'NOT_STARTED' || mastery === 'INTRODUCED') return 'LEARN';
  if (mastery === 'DEVELOPING') return 'PRACTICE';
  return null;
}

export function listAdaptiveCandidates(input: AdaptiveCandidateInput): AdaptiveCandidate[] {
  const candidates: AdaptiveCandidate[] = [];

  for (const mistake of input.mistakes) {
    if (mistake.priority === 'LOW') continue;
    const blocking = mistake.priority === 'BLOCKING';
    candidates.push({
      objectiveId: mistake.objectiveId,
      intent: 'CORRECTION',
      reason: blocking ? 'BLOCKING_MISTAKE' : 'UNRESOLVED_MISTAKE',
      priorityClass: blocking ? 'MANDATORY' : 'HIGH',
      targetMistakeId: mistake.mistakeId,
      rationaleCodes: blocking
        ? ['BLOCKING_MISTAKE', ...(mistake.recurrent ? ['RECURRENT_MISTAKE' as const] : [])]
        : [],
    });
  }

  for (const prerequisite of input.prerequisites) {
    let intent: 'LEARN' | 'PRACTICE' | 'REVIEW' | null = intentForDevelopingState(prerequisite.mastery);
    if (prerequisite.mastery === 'MASTERED' && prerequisite.reviewDue) intent = 'REVIEW';
    if (!intent) continue;
    candidates.push({
      objectiveId: prerequisite.objectiveId,
      intent,
      reason: 'PREREQUISITE_GAP',
      priorityClass: prerequisite.targetReadiness === 'BLOCKED' ? 'MANDATORY' : 'HIGH',
      targetObjectiveId: prerequisite.targetObjectiveId,
      rationaleCodes: ['PREREQUISITE_GAP'],
    });
  }

  for (const review of input.reviews) {
    candidates.push({
      objectiveId: review.objectiveId,
      intent: 'REVIEW',
      reason: 'REVIEW_DUE',
      priorityClass: 'NORMAL',
      rationaleCodes: [
        ...(review.performance === 'STRUGGLING' ? ['URGENT_REVIEW' as const] : []),
        'REVIEW_DUE',
      ],
    });
  }

  if (input.current) {
    const intent = intentForDevelopingState(input.current.mastery);
    if (intent) {
      candidates.push({
        objectiveId: input.current.objectiveId,
        intent,
        reason: 'CURRENT_OBJECTIVE',
        priorityClass: 'NORMAL',
        rationaleCodes: [
          'CURRENT_OBJECTIVE_NOT_MASTERED',
          ...practiceRationale(input.current.performance, input.current.strategyNeedsDevelopment),
        ],
      });
    }
  }

  for (const next of input.next) {
    if (next.readiness !== 'READY' || next.mastery === 'MASTERED') continue;
    const intent = intentForDevelopingState(next.mastery);
    if (!intent) continue;
    candidates.push({
      objectiveId: next.objectiveId,
      intent,
      reason: 'NEXT_READY_OBJECTIVE',
      priorityClass: 'NORMAL',
      rationaleCodes: [
        'NEXT_OBJECTIVE_READY',
        ...practiceRationale(next.performance, next.strategyNeedsDevelopment),
      ],
    });
  }

  return candidates.sort((left, right) =>
    REASON_RANK[left.reason] - REASON_RANK[right.reason]
    || left.objectiveId.localeCompare(right.objectiveId)
    || (left.targetMistakeId ?? '').localeCompare(right.targetMistakeId ?? ''));
}
