import type { AdaptiveRepository } from '@/lib/adaptation';
import { deriveLessonExecutionState } from '@/lib/planning';
import type { PlanningRepository } from '@/lib/planning';
import type { ParentProgressService } from '@/lib/progress';
import type { PilotAdaptiveReview, PilotLessonReview, PilotReview } from './types';

export interface PilotReviewServiceDependencies {
  parentProgress: Pick<ParentProgressService, 'getView'>;
  planning: PlanningRepository;
  adaptive: AdaptiveRepository;
}

function atOrBefore(value: string, cutoff: string): boolean {
  return Date.parse(value) <= Date.parse(cutoff);
}

export class PilotReviewService {
  constructor(private readonly dependencies: PilotReviewServiceDependencies) {}

  async getReview(studentId: string, evaluatedAt: string): Promise<PilotReview> {
    if (!evaluatedAt || Number.isNaN(Date.parse(evaluatedAt))) {
      throw new Error('evaluatedAt must be a valid ISO date-time string');
    }

    const [progress, planRows] = await Promise.all([
      this.dependencies.parentProgress.getView(studentId, evaluatedAt),
      this.dependencies.planning.listWeeklyPlansForStudent(studentId),
    ]);
    const plans = planRows.filter((plan) => atOrBefore(plan.createdAt, evaluatedAt));
    const planFacts = await Promise.all(plans.map(async (plan) => {
      const planLessons = (await this.dependencies.planning.listDailyLessonsForPlan(plan.id))
        .filter((lesson) => atOrBefore(lesson.createdAt, evaluatedAt));
      const lessonFacts = await Promise.all(planLessons.map(async (lesson) => {
        const [events, supersession, decisions] = await Promise.all([
          this.dependencies.planning.listExecutionEvents(lesson.id),
          this.dependencies.adaptive.getSupersessionByReplacementLesson(lesson.id),
          this.dependencies.adaptive.listDecisionsForSourceLesson(lesson.id),
        ]);
        const review: PilotLessonReview = {
          lessonId: lesson.id,
          weekStart: plan.weekStart,
          sequence: lesson.sequence,
          intent: lesson.intent,
          objectiveIds: [...lesson.objectiveIds],
          execution: deriveLessonExecutionState(
            lesson.id,
            events.filter((event) => atOrBefore(event.occurredAt, evaluatedAt)),
          ),
          adapted: supersession !== undefined && atOrBefore(supersession.createdAt, evaluatedAt),
        };
        const adaptiveReviews = decisions
          .filter((decision) => atOrBefore(decision.createdAt, evaluatedAt))
          .map((decision): PilotAdaptiveReview => ({
            decisionId: decision.id,
            sourceLessonId: decision.sourceLessonId,
            action: decision.action,
            policyVersion: decision.policyVersion,
            inputFactCutoff: decision.inputFactCutoff,
            rationaleCodes: [...decision.rationaleCodes],
            createdAt: decision.createdAt,
          }));
        return { review, adaptiveReviews };
      }));
      return lessonFacts;
    }));

    const lessons = planFacts.flat().map((fact) => fact.review);
    const decisionsById = new Map<string, PilotAdaptiveReview>();
    for (const fact of planFacts.flat()) {
      for (const decision of fact.adaptiveReviews) decisionsById.set(decision.decisionId, decision);
    }

    lessons.sort((left, right) => left.weekStart.localeCompare(right.weekStart)
      || left.sequence - right.sequence
      || left.lessonId.localeCompare(right.lessonId));
    const recentAdaptiveDecisions = [...decisionsById.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.decisionId.localeCompare(right.decisionId));

    return structuredClone({
      studentId,
      evaluatedAt,
      progress,
      lessons,
      recentAdaptiveDecisions,
      nextLesson: progress.nextLesson,
    });
  }
}
