import { getLearningObjective } from '@/lib/curriculum';
import { deriveLessonExecutionState } from '@/lib/planning';
import type { LessonIntent, PlanningRepository } from '@/lib/planning';
import type { AdaptiveRepository } from './repository';
import type { AdaptiveDecision } from './types';
import type { EffectiveLesson } from './effective-lesson';

export interface StudentNextLessonView {
  lessonId: string;
  intent: LessonIntent;
  objectiveSummary: string;
  adapted: boolean;
}

export interface NextEffectiveLessonProjection {
  effectiveLesson: EffectiveLesson;
  decision?: AdaptiveDecision;
}

export function toStudentNextLessonView(input: { effectiveLesson: EffectiveLesson }): StudentNextLessonView {
  const { lesson, adapted } = input.effectiveLesson;
  return {
    lessonId: lesson.id,
    intent: lesson.intent,
    objectiveSummary: lesson.objectiveIds.map((objectiveId) => getLearningObjective(objectiveId).title).join(' · '),
    adapted,
  };
}

export async function findNextEffectiveLesson(
  planning: PlanningRepository,
  adaptive: AdaptiveRepository,
  studentId: string,
  evaluatedAt: string,
): Promise<NextEffectiveLessonProjection | null> {
  if (!evaluatedAt || Number.isNaN(Date.parse(evaluatedAt))) throw new Error('evaluatedAt must be a valid ISO date-time string');
  const plans = (await planning.listWeeklyPlansForStudent(studentId))
    .filter((plan) => Date.parse(plan.createdAt) <= Date.parse(evaluatedAt));
  const candidates: Array<{ weekStart: string; effectiveLesson: EffectiveLesson }> = [];
  const seen = new Set<string>();

  for (const plan of plans) {
    const lessons = (await planning.listDailyLessonsForPlan(plan.id))
      .filter((lesson) => Date.parse(lesson.createdAt) <= Date.parse(evaluatedAt));
    for (const lesson of lessons) {
      let effectiveLesson: EffectiveLesson;
      const incoming = await adaptive.getSupersessionByReplacementLesson(lesson.id);
      if (incoming && Date.parse(incoming.createdAt) <= Date.parse(evaluatedAt)) {
        effectiveLesson = {
          lesson,
          originalLessonId: incoming.sourceLessonId,
          adapted: true,
          adaptiveDecisionId: incoming.adaptiveDecisionId,
        };
      } else {
        const outgoing = await adaptive.getSupersessionForSourceLesson(lesson.id);
        if (outgoing && Date.parse(outgoing.createdAt) <= Date.parse(evaluatedAt)) {
          const replacement = await planning.getDailyLesson(outgoing.replacementLessonId);
          if (!replacement) throw new Error(`Dangling lesson supersession replacement: ${outgoing.replacementLessonId}`);
          effectiveLesson = {
            lesson: replacement,
            originalLessonId: lesson.id,
            adapted: true,
            adaptiveDecisionId: outgoing.adaptiveDecisionId,
          };
        } else {
          effectiveLesson = { lesson, originalLessonId: lesson.id, adapted: false };
        }
      }
      if (Date.parse(effectiveLesson.lesson.createdAt) > Date.parse(evaluatedAt) || seen.has(effectiveLesson.lesson.id)) continue;
      seen.add(effectiveLesson.lesson.id);
      candidates.push({ weekStart: plan.weekStart, effectiveLesson });
    }
  }

  candidates.sort((left, right) =>
    left.weekStart.localeCompare(right.weekStart)
    || left.effectiveLesson.lesson.sequence - right.effectiveLesson.lesson.sequence
    || left.effectiveLesson.lesson.createdAt.localeCompare(right.effectiveLesson.lesson.createdAt)
    || left.effectiveLesson.lesson.id.localeCompare(right.effectiveLesson.lesson.id));

  for (const candidate of candidates) {
    const lesson = candidate.effectiveLesson.lesson;
    const events = (await planning.listExecutionEvents(lesson.id))
      .filter((event) => Date.parse(event.occurredAt) <= Date.parse(evaluatedAt));
    if (deriveLessonExecutionState(lesson.id, events).status !== 'PLANNED') continue;
    let decision: AdaptiveDecision | undefined;
    if (candidate.effectiveLesson.adaptiveDecisionId) {
      const decisions = await adaptive.listDecisionsForSourceLesson(candidate.effectiveLesson.originalLessonId);
      decision = decisions.find((item) => item.id === candidate.effectiveLesson.adaptiveDecisionId);
      if (!decision) throw new Error(`Dangling adaptive decision id: ${candidate.effectiveLesson.adaptiveDecisionId}`);
    } else {
      const decisions = await adaptive.listDecisionsForSourceLesson(lesson.id);
      decision = decisions
        .filter((item) => Date.parse(item.createdAt) <= Date.parse(evaluatedAt))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id))[0];
    }
    return { effectiveLesson: candidate.effectiveLesson, ...(decision ? { decision } : {}) };
  }
  return null;
}
