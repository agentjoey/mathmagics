import type {
  AdaptiveDecisionAction,
  AdaptiveRationaleCode,
  NextLessonView,
} from '@/lib/adaptation';
import type { ParentProgressView } from '@/lib/progress';
import type { DailyLessonExecutionState, LessonIntent } from '@/lib/planning';

export interface PilotLessonReview {
  lessonId: string;
  weekStart: string;
  sequence: number;
  intent: LessonIntent;
  objectiveIds: string[];
  execution: DailyLessonExecutionState;
  adapted: boolean;
}

export interface PilotAdaptiveReview {
  decisionId: string;
  sourceLessonId: string;
  action: AdaptiveDecisionAction;
  policyVersion: 'adaptive-policy-v1';
  inputFactCutoff: string;
  rationaleCodes: AdaptiveRationaleCode[];
  createdAt: string;
}

export interface PilotReview {
  studentId: string;
  evaluatedAt: string;
  progress: ParentProgressView;
  lessons: PilotLessonReview[];
  recentAdaptiveDecisions: PilotAdaptiveReview[];
  nextLesson: NextLessonView | null;
}
