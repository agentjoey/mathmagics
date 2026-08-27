export { deriveCoverage } from './coverage';
export type { CompletedLearnLessonFact, CoverageInput } from './coverage';
export { derivePerformance } from './performance';
export type { PerformanceInput } from './performance';
export {
  buildParentProgressView,
  ParentProgressService,
} from './parent-view';
export type {
  BuildParentProgressViewInput,
  ObjectiveProgressView,
  ParentProgressServiceDependencies,
  ParentProgressView,
  ProgressSummary,
  StrategyProgressView,
  TopicProgressView,
} from './parent-view';
export { ProgressService } from './service';
export type { ProgressServiceDependencies } from './service';
export type {
  CoverageState,
  ObjectiveProgress,
  PerformanceRiskFacts,
  PerformanceRiskSnapshot,
  PerformanceSnapshot,
  PerformanceState,
  TopicProgressSummary,
} from './types';
