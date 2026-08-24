import type { MasteryState, ReadinessState, StudentLevel } from '@/lib/learning';

export interface LearningPosition {
  studentId: string;
  levelId: StudentLevel;
  anchorTopicId?: string;
  anchorObjectiveId?: string;
  reviewObjectiveIds: string[];
  derivedAt: string;
}

export type PlannerCandidateReason =
  | 'REVIEW_DUE'
  | 'PREREQUISITE_SUPPORT'
  | 'CURRENT_POSITION'
  | 'NEXT_IN_SEQUENCE';

export interface LearningCandidate {
  objectiveId: string;
  reason: PlannerCandidateReason;
  readiness: ReadinessState;
  mastery: MasteryState;
  reviewDue: boolean;
  targetObjectiveId?: string;
  curriculumOrder: number;
}

export type LessonIntent = 'LEARN' | 'PRACTICE' | 'REVIEW' | 'CORRECTION' | 'ASSESSMENT';

export interface PlanningRationale {
  code: PlannerCandidateReason;
  objectiveId: string;
  targetObjectiveId?: string;
}

export interface WeeklyPlan {
  id: string;
  studentId: string;
  weekStart: string;
  sessionsPerWeek: number;
  minutesPerSession: number;
  createdAt: string;
}

export interface DailyLesson {
  id: string;
  weeklyPlanId: string;
  studentId: string;
  sequence: number;
  intent: LessonIntent;
  objectiveIds: string[];
  estimatedMinutes: number;
  rationale: PlanningRationale[];
  createdAt: string;
}

export type LessonExecutionEventType = 'STARTED' | 'COMPLETED' | 'SKIPPED';

export interface LessonExecutionEvent {
  id: string;
  lessonId: string;
  studentId: string;
  type: LessonExecutionEventType;
  occurredAt: string;
  actualMinutes?: number;
}

export type DailyLessonExecutionStatus = 'PLANNED' | 'STARTED' | 'COMPLETED' | 'SKIPPED';

export interface DailyLessonExecutionState {
  lessonId: string;
  status: DailyLessonExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  skippedAt?: string;
  actualMinutes?: number;
}

export interface GeneratedLessonBriefContent {
  objectiveSummary: string;
  readinessCheck: string[];
  teachingSequence: Array<{
    stage: 'CONCRETE' | 'PICTORIAL' | 'ABSTRACT';
    guidance: string;
  }>;
  keyQuestions: string[];
  workedExampleSuggestions: string[];
  misconceptionWatchouts: string[];
  masteryCheck: string[];
}

export interface LessonBriefRecord {
  id: string;
  lessonId: string;
  studentId: string;
  generator: string;
  model: string;
  contextVersion: string;
  content: GeneratedLessonBriefContent;
  createdAt: string;
}
