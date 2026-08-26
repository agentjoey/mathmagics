import type {
  DiagnosisTarget,
  ReasoningCheckSpec,
  TrustedAttemptProblem,
} from '@/lib/correction';

export interface MistakeDiagnosisContext {
  objectiveId: string;
  allowedTargets: DiagnosisTarget[];
  problemDescription: string;
  studentAnswer: string;
  deterministicObservations: string[];
}

export interface DiagnosisCandidate {
  target: DiagnosisTarget;
  rationale: string;
}

export interface TrustedCorrectionContext {
  mistakeId: string;
  objectiveId: string;
  diagnosisTarget: DiagnosisTarget;
  problem: Omit<TrustedAttemptProblem, 'answerSpec'>;
  strategies: Array<{ id: string; name: string; description: string }>;
  representations: Array<{ id: string; name: string; description: string }>;
  reasoningChecks: ReasoningCheckSpec[];
}

export interface CorrectionGuidance {
  diagnosisExplanation: string;
  socraticPrompts: string[];
  workedExplanation?: string;
}

export interface CorrectionAIProvider {
  proposeDiagnosis(context: MistakeDiagnosisContext): Promise<DiagnosisCandidate>;
  prepareGuidance(context: TrustedCorrectionContext): Promise<CorrectionGuidance>;
}
