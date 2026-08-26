import type { MasterySnapshot } from '@/lib/learning';

export type CoverageState = 'NOT_SEEN' | 'INTRODUCED' | 'ENGAGED' | 'PRACTISED';
export type PerformanceState = 'INSUFFICIENT_DATA' | 'STRUGGLING' | 'UNSTABLE' | 'STABLE';

export interface PerformanceSnapshot {
  state: PerformanceState;
  attemptCount: number;
  correctRate: number;
  independentCorrectRate: number;
  hintRate: number;
  incorrectRate: number;
  recentIncorrectStreak: number;
  recurrenceCount: number;
  windowStart: string | null;
  windowEnd: string | null;
}

export interface ObjectiveProgress {
  studentId: string;
  objectiveId: string;
  coverage: CoverageState;
  mastery: MasterySnapshot;
  performance: PerformanceSnapshot;
  reviewDue: boolean;
  strategyIds: string[];
}

export interface TopicProgressSummary {
  objectiveCount: number;
  coverage: { notSeen: number; introduced: number; engaged: number; practised: number };
  mastery: { notStarted: number; introduced: number; developing: number; mastered: number };
  performance: { insufficientData: number; struggling: number; unstable: number; stable: number };
}

export interface PerformanceRiskFacts {
  recurrenceCount(studentId: string, objectiveId: string, cutoff: string): Promise<number>;
  hasBlockingMistake(studentId: string, objectiveId: string, cutoff: string): Promise<boolean>;
}
