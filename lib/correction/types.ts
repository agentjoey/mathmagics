import type { EvidenceRecord } from '@/lib/learning';
import type { AnswerSpec, Attempt, PracticeProblemSpec } from '@/lib/practice';

export type MistakeState = 'OBSERVED' | 'CONFIRMED' | 'CORRECTING' | 'RESOLVED';
export type GenericDiagnosisCode = 'FACT_ERROR' | 'PROCEDURE_ERROR' | 'REPRESENTATION_ERROR' | 'UNKNOWN';
export type DiagnosisTarget =
  | { kind: 'MISCONCEPTION'; misconceptionId: string }
  | { kind: 'GENERIC'; code: GenericDiagnosisCode };

export interface Mistake {
  id: string;
  studentId: string;
  objectiveId: string;
  initialAttemptId: string;
  initialDiagnosisTarget: DiagnosisTarget;
  diagnosisPolicyVersion: 'mistake-diagnosis-v1';
  firstObservedAt: string;
  createdAt: string;
}

export type MistakeAttemptRole = 'OBSERVATION' | 'CORRECTION_RETRY' | 'TRANSFER';
export interface MistakeAttemptLink {
  mistakeId: string;
  attemptId: string;
  role: MistakeAttemptRole;
  linkedAt: string;
}

export type MistakeEventType =
  | 'MISTAKE_OBSERVED'
  | 'ATTEMPT_LINKED'
  | 'DIAGNOSIS_CANDIDATE_RECORDED'
  | 'DIAGNOSIS_CONFIRMED'
  | 'CORRECTION_STARTED'
  | 'GUIDANCE_PREPARED'
  | 'REASONING_ASSISTANCE_REVEALED'
  | 'MISTAKE_CONSOLIDATED'
  | 'MISTAKE_RESOLVED';

export interface MistakeEvent {
  id: string;
  mistakeId: string;
  type: MistakeEventType;
  payload: Record<string, unknown>;
  actorKind: 'SYSTEM' | 'STUDENT' | 'PARENT' | 'AI_PROVIDER';
  policyVersion: string;
  occurredAt: string;
}

export type CorrectionItemKind = 'ORIGINAL_RETRY' | 'TRANSFER';
export interface CorrectionItem {
  id: string;
  mistakeId: string;
  studentId: string;
  objectiveId: string;
  kind: CorrectionItemKind;
  sourceAttemptId: string;
  transferRound?: number;
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  prompt: string;
  hint?: string;
  solutionOutline: string[];
  generator: string;
  generatorVersion: string;
  createdAt: string;
}

export type ReasoningCheckSpec =
  | {
      id: string;
      kind: 'CHOICE';
      prompt: string;
      options: Array<{ id: string; label: string }>;
      expectedOptionId: string;
    }
  | {
      id: string;
      kind: 'FIELDS';
      prompt: string;
      fields: string[];
      expected: Record<string, string>;
    };

export interface CorrectionReasoningCheck {
  id: string;
  mistakeId: string;
  studentId: string;
  objectiveId: string;
  checkSpec: ReasoningCheckSpec;
  response: Record<string, string>;
  outcome: 'PASS' | 'FAIL';
  assisted: boolean;
  policyVersion: 'correction-reasoning-v1';
  submittedAt: string;
  recordedAt: string;
}

export interface TrustedAttemptProblem {
  attempt: Attempt;
  problemSpec: PracticeProblemSpec;
  answerSpec: AnswerSpec;
  prompt: string;
  hint?: string;
  solutionOutline: string[];
  classification: 'FOUNDATION' | 'CORE' | 'APPLICATION' | 'CHALLENGE';
}

export interface DeterministicDiagnosisResult {
  allowedTargets: DiagnosisTarget[];
  provenTargets: DiagnosisTarget[];
  observations: string[];
}

export interface MistakeProjectionInput {
  mistake: Mistake;
  events: MistakeEvent[];
  links: MistakeAttemptLink[];
  attempts: Attempt[];
  evidence: EvidenceRecord[];
  correctionItems: CorrectionItem[];
  reasoningChecks: CorrectionReasoningCheck[];
}

export interface MisconceptionSummary {
  studentId: string;
  target: DiagnosisTarget;
  activeEpisodeCount: number;
  resolvedEpisodeCount: number;
  recurrenceCount: number;
  linkedIncorrectObservationCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
}
