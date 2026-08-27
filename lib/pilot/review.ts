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

    const progress = await this.dependencies.parentProgress.getView(studentId, evaluatedAt);
    const plans = (await this.dependencies.planning.listWeeklyPlansForStudent(studentId))
      .filter((plan) => atOrBefore(plan.createdAt, evaluatedAt));

    const lessons: PilotLessonReview[] = [];
    const decisionsById = new Map<string, PilotAdaptiveReview>();

    for (const plan of plans) {
      const planLessons = (await this.dependencies.planning.listDailyLessonsForPlan(plan.id))
        .filter((lesson) => atOrBefore(lesson.createdAt, evaluatedAt));

      for (const lesson of planLessons) {
        const events = (await this.dependencies.planning.listExecutionEvents(lesson.id))
          .filter((event) => atOrBefore(event.occurredAt, evaluatedAt));
        const supersession = await this.dependencies.adaptive.getSupersessionByReplacementLesson(lesson.id);

        lessons.push({
          lessonId: lesson.id,
          weekStart: plan.weekStart,
          sequence: lesson.sequence,
          intent: lesson.intent,
          objectiveIds: [...lesson.objectiveIds],
          execution: deriveLessonExecutionState(lesson.id, events),
          adapted: supersession !== undefined && atOrBefore(supersession.createdAt, evaluatedAt),
        });

        const decisions = await this.dependencies.adaptive.listDecisionsForSourceLesson(lesson.id);
        for (const decision of decisions) {
          if (!atOrBefore(decision.createdAt, evaluatedAt)) continue;
          decisionsById.set(decision.id, {
            decisionId: decision.id,
            sourceLessonId: decision.sourceLessonId,
            action: decision.action,
            policyVersion: decision.policyVersion,
            inputFactCutoff: decision.inputFactCutoff,
            rationaleCodes: [...decision.rationaleCodes],
            createdAt: decision.createdAt,
          });
        }
      }
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
