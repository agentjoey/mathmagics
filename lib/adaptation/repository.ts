import type { DailyLesson } from '@/lib/planning';
import type { AdaptiveDecision, LessonSupersession } from './types';

export interface AdaptiveRepository {
  getDecisionByEvaluationKey(
    studentId: string,
    sourceLessonId: string,
    inputFactCutoff: string,
    policyVersion: string,
  ): Promise<AdaptiveDecision | undefined>;
  listDecisionsForSourceLesson(sourceLessonId: string): Promise<AdaptiveDecision[]>;
  appendKeepDecision(decision: AdaptiveDecision): Promise<void>;
  commitSupersession(input: {
    decision: AdaptiveDecision;
    replacementLesson: DailyLesson;
    supersession: LessonSupersession;
  }): Promise<void>;
  getSupersessionForSourceLesson(sourceLessonId: string): Promise<LessonSupersession | undefined>;
  getSupersessionByReplacementLesson(replacementLessonId: string): Promise<LessonSupersession | undefined>;
}
