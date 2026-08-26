import type { PlanningRepository, DailyLesson } from '@/lib/planning';
import type { AdaptiveRepository } from './repository';

export interface EffectiveLesson {
  lesson: DailyLesson;
  originalLessonId: string;
  adapted: boolean;
  adaptiveDecisionId?: string;
}

export async function resolveEffectiveLesson(
  planning: PlanningRepository,
  adaptive: AdaptiveRepository,
  lessonId: string,
): Promise<EffectiveLesson> {
  const requested = await planning.getDailyLesson(lessonId);
  if (!requested) throw new Error(`Unknown daily lesson id: ${lessonId}`);

  const asReplacement = await adaptive.getSupersessionByReplacementLesson(lessonId);
  if (asReplacement) {
    const original = await planning.getDailyLesson(asReplacement.sourceLessonId);
    if (!original) throw new Error(`Dangling lesson supersession source: ${asReplacement.sourceLessonId}`);
    if (original.studentId !== requested.studentId) throw new Error('lesson supersession student mismatch');
    return {
      lesson: requested,
      originalLessonId: original.id,
      adapted: true,
      adaptiveDecisionId: asReplacement.adaptiveDecisionId,
    };
  }

  const supersession = await adaptive.getSupersessionForSourceLesson(lessonId);
  if (!supersession) {
    return { lesson: requested, originalLessonId: requested.id, adapted: false };
  }

  const replacement = await planning.getDailyLesson(supersession.replacementLessonId);
  if (!replacement) throw new Error(`Dangling lesson supersession replacement: ${supersession.replacementLessonId}`);
  if (replacement.studentId !== requested.studentId) throw new Error('lesson supersession student mismatch');
  return {
    lesson: replacement,
    originalLessonId: requested.id,
    adapted: true,
    adaptiveDecisionId: supersession.adaptiveDecisionId,
  };
}
