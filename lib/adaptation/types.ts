import type { LessonIntent } from '@/lib/planning';

export type MistakePriority = 'LOW' | 'NORMAL' | 'BLOCKING';

export type AdaptiveRationaleCode =
  | 'BLOCKING_MISTAKE'
  | 'RECURRENT_MISTAKE'
  | 'PREREQUISITE_GAP'
  | 'URGENT_REVIEW'
  | 'REVIEW_DUE'
  | 'PERFORMANCE_STRUGGLING'
  | 'STRATEGY_DEVELOPMENT_NEEDED'
  | 'CURRENT_OBJECTIVE_NOT_MASTERED'
  | 'NEXT_OBJECTIVE_READY'
  | 'STARVATION_GUARD_FORWARD_PROGRESS'
  | 'NO_HIGHER_PRIORITY_NEED'
  | 'SOURCE_LESSON_ALREADY_STARTED'
  | 'REPLACEMENT_LESSON_IMMUTABLE';

export type AdaptiveCandidateReason =
  | 'BLOCKING_MISTAKE'
  | 'PREREQUISITE_GAP'
  | 'UNRESOLVED_MISTAKE'
  | 'REVIEW_DUE'
  | 'PERFORMANCE_STRUGGLING'
  | 'CURRENT_OBJECTIVE'
  | 'NEXT_READY_OBJECTIVE';

export interface AdaptiveCandidate {
  objectiveId: string;
  intent: Extract<LessonIntent, 'CORRECTION' | 'REVIEW' | 'LEARN' | 'PRACTICE'>;
  reason: AdaptiveCandidateReason;
  priorityClass: 'MANDATORY' | 'HIGH' | 'NORMAL';
  targetObjectiveId?: string;
  targetMistakeId?: string;
  rationaleCodes: AdaptiveRationaleCode[];
}

export type AdaptiveDecisionAction = 'KEEP' | 'SUPERSEDE';

export interface AdaptiveDecision {
  id: string;
  studentId: string;
  sourceLessonId: string;
  action: AdaptiveDecisionAction;
  selectedIntent: LessonIntent;
  selectedObjectiveIds: string[];
  targetMistakeId?: string;
  rationaleCodes: AdaptiveRationaleCode[];
  policyVersion: 'adaptive-policy-v1';
  evaluatedAt: string;
  inputFactCutoff: string;
  createdAt: string;
}

export interface LessonSupersession {
  id: string;
  studentId: string;
  sourceLessonId: string;
  replacementLessonId: string;
  adaptiveDecisionId: string;
  createdAt: string;
}
