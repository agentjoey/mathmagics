export type StudentLevel = 'P2' | 'P3';
export type LearningMode = 'FOLLOW_SCHOOL' | 'STRUCTURED_HOME_LEARNING';

export interface StudentProfile {
  id: string;
  displayName: string;
  levelId: StudentLevel;
  learningMode: LearningMode;
  sessionsPerWeek: number;
  minutesPerSession: number;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentPositionAssumption {
  studentId: string;
  levelId: StudentLevel;
  topicId?: string;
  objectiveId?: string;
  recordedAt: string;
  source: 'MANUAL_SETUP';
}

export type EvidenceType =
  | 'introduced'
  | 'incorrect'
  | 'correct_with_hint'
  | 'independent_correct'
  | 'corrected'
  | 'explained_independently'
  | 'application_correct';

export type EvidenceOriginKind = 'SETUP' | 'LESSON' | 'PRACTICE' | 'HOMEWORK' | 'CORRECTION';

export interface EvidenceOrigin {
  kind: EvidenceOriginKind;
  refId?: string;
}

export interface EvidenceRecord {
  id: string;
  studentId: string;
  objectiveId: string;
  type: EvidenceType;
  observedAt: string;
  recordedAt: string;
  origin: EvidenceOrigin;
}

export type MasteryState = 'NOT_STARTED' | 'INTRODUCED' | 'DEVELOPING' | 'MASTERED';

export interface MasterySnapshot {
  studentId: string;
  objectiveId: string;
  state: MasteryState;
  reviewDue: boolean;
  evidenceCount: number;
  lastEvidenceAt: string | null;
}

export type ReadinessState = 'READY' | 'NEEDS_SUPPORT' | 'BLOCKED';

export interface PrerequisiteStatus {
  objectiveId: string;
  mastery: MasteryState;
  reviewDue: boolean;
}

export interface ObjectiveReadiness {
  studentId: string;
  objectiveId: string;
  state: ReadinessState;
  ready: boolean;
  prerequisites: PrerequisiteStatus[];
  blockingPrerequisites: PrerequisiteStatus[];
}
