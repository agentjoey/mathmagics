export { listAdaptiveCandidates } from './candidates';
export type {
  AdaptiveCandidateInput,
  AdaptiveCurrentNeed,
  AdaptiveMistakeNeed,
  AdaptiveNextNeed,
  AdaptivePrerequisiteNeed,
  AdaptiveReviewNeed,
} from './candidates';
export { resolveEffectiveLesson } from './effective-lesson';
export type { EffectiveLesson } from './effective-lesson';
export { MemoryAdaptiveRepository } from './memory-repository';
export { deriveMistakePriority } from './mistake-priority';
export type { MistakePriorityInput } from './mistake-priority';
export { selectAdaptiveRecommendation } from './policy';
export type { AdaptiveRecommendation } from './policy';
export { CorrectionPerformanceRiskFacts } from './progress-risk';
export type { CorrectionPerformanceRiskFactsDependencies } from './progress-risk';
export type { AdaptiveRepository } from './repository';
export { deriveStarvationGuard } from './starvation';
export type { AdaptiveLessonHistoryFact } from './starvation';
export type {
  AdaptiveCandidate,
  AdaptiveCandidateReason,
  AdaptiveDecision,
  AdaptiveDecisionAction,
  AdaptiveRationaleCode,
  LessonSupersession,
  MistakePriority,
} from './types';
export {
  adaptiveEvaluationKey,
  assertValidAdaptiveDecision,
  assertValidLessonSupersession,
} from './validation';
