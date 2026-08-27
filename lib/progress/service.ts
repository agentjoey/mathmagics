import { getLearningObjective, listObjectivesForTopic } from '@/lib/curriculum';
import { deriveMastery } from '@/lib/learning';
import type { EvidenceRecord, LearningStateRepository } from '@/lib/learning';
import { deriveLessonExecutionState } from '@/lib/planning';
import type { PlanningRepository } from '@/lib/planning';
import type { Attempt, PracticeRepository } from '@/lib/practice';
import { deriveCoverage } from './coverage';
import { derivePerformance } from './performance';
import type {
  ObjectiveProgress,
  PerformanceRiskFacts,
  PerformanceRiskSnapshot,
  TopicProgressSummary,
} from './types';

export interface ProgressServiceDependencies {
  learning: LearningStateRepository;
  planning: PlanningRepository;
  practice: PracticeRepository;
  riskFacts: PerformanceRiskFacts;
}

function requireCutoff(cutoff: string): void {
  if (!cutoff || Number.isNaN(Date.parse(cutoff))) {
    throw new Error('progress cutoff must be a valid ISO date-time string');
  }
}

function factAvailable(observedAt: string, recordedAt: string, cutoff: string): boolean {
  return Date.parse(observedAt) <= Date.parse(cutoff) && Date.parse(recordedAt) <= Date.parse(cutoff);
}

function attemptAvailable(attempt: Attempt, cutoff: string): boolean {
  return factAvailable(attempt.submittedAt, attempt.recordedAt, cutoff);
}

function evidenceAvailable(record: EvidenceRecord, cutoff: string): boolean {
  return factAvailable(record.observedAt, record.recordedAt, cutoff);
}

export class ProgressService {
  constructor(private readonly dependencies: ProgressServiceDependencies) {}

  private async completedLearnLessons(studentId: string, cutoff: string): Promise<Array<{ lessonId: string; objectiveIds: string[] }>> {
    const plans = (await this.dependencies.planning.listWeeklyPlansForStudent(studentId))
      .filter((plan) => Date.parse(plan.createdAt) <= Date.parse(cutoff));
    const lessonsByPlan = await Promise.all(
      plans.map((plan) => this.dependencies.planning.listDailyLessonsForPlan(plan.id)),
    );
    const learnLessons = lessonsByPlan.flat()
      .filter((lesson) => lesson.intent === 'LEARN' && Date.parse(lesson.createdAt) <= Date.parse(cutoff));
    const eventGroups = await Promise.all(
      learnLessons.map((lesson) => this.dependencies.planning.listExecutionEvents(lesson.id)),
    );

    return learnLessons.flatMap((lesson, index) => {
      const events = eventGroups[index]!
        .filter((event) => Date.parse(event.occurredAt) <= Date.parse(cutoff));
      const state = deriveLessonExecutionState(lesson.id, events);
      return state.status === 'COMPLETED'
        ? [{ lessonId: lesson.id, objectiveIds: [...lesson.objectiveIds] }]
        : [];
    });
  }

  async getObjectivesProgress(
    studentId: string,
    objectiveIds: string[],
    cutoff: string,
    suppliedRiskSnapshot?: PerformanceRiskSnapshot,
  ): Promise<ObjectiveProgress[]> {
    requireCutoff(cutoff);
    const student = await this.dependencies.learning.getStudent(studentId);
    if (!student) throw new Error(`Unknown student id: ${studentId}`);

    const objectives = objectiveIds.map((objectiveId) => getLearningObjective(objectiveId));
    const riskSnapshotPromise = suppliedRiskSnapshot
      ? Promise.resolve(suppliedRiskSnapshot)
      : this.dependencies.riskFacts.snapshot
        ? this.dependencies.riskFacts.snapshot(studentId, cutoff)
        : Promise.resolve<PerformanceRiskSnapshot | undefined>(undefined);
    const [allAttempts, completedLearnLessons, riskSnapshot] = await Promise.all([
      this.dependencies.practice.listAttemptsForStudent(studentId),
      this.completedLearnLessons(studentId, cutoff),
      riskSnapshotPromise,
    ]);
    const availableAttempts = allAttempts.filter((attempt) => attemptAvailable(attempt, cutoff));
    const evidenceByObjective = await Promise.all(
      objectives.map(async (objective) => (await this.dependencies.learning.listEvidenceForObjective(studentId, objective.id))
        .filter((record) => evidenceAvailable(record, cutoff))),
    );
    const riskByObjective = await Promise.all(
      objectives.map(async (objective) => {
        if (riskSnapshot) {
          return {
            recurrenceCount: riskSnapshot.recurrenceCount(objective.id),
            hasBlockingMistake: riskSnapshot.hasBlockingMistake(objective.id),
          };
        }
        const [recurrenceCount, hasBlockingMistake] = await Promise.all([
          this.dependencies.riskFacts.recurrenceCount(studentId, objective.id, cutoff),
          this.dependencies.riskFacts.hasBlockingMistake(studentId, objective.id, cutoff),
        ]);
        return { recurrenceCount, hasBlockingMistake };
      }),
    );

    return objectives.map((objective, index) => {
      const evidence = evidenceByObjective[index]!;
      const attempts = availableAttempts.filter((attempt) => attempt.objectiveId === objective.id);
      const risk = riskByObjective[index]!;
      const mastery = deriveMastery(studentId, objective.id, evidence);
      const coverage = deriveCoverage({
        objectiveId: objective.id,
        evidence,
        rootAttempts: attempts,
        completedLearnLessons,
      });
      const performance = derivePerformance({
        attempts,
        evaluatedAt: cutoff,
        recurrenceCount: risk.recurrenceCount,
        hasBlockingMistake: risk.hasBlockingMistake,
      });

      return {
        studentId,
        objectiveId: objective.id,
        coverage,
        mastery,
        performance,
        reviewDue: mastery.reviewDue,
        strategyIds: [...objective.strategyIds],
      };
    });
  }

  async getObjectiveProgress(studentId: string, objectiveId: string, cutoff: string): Promise<ObjectiveProgress> {
    const [progress] = await this.getObjectivesProgress(studentId, [objectiveId], cutoff);
    return progress!;
  }

  async getTopicProgress(studentId: string, topicId: string, cutoff: string): Promise<TopicProgressSummary> {
    requireCutoff(cutoff);
    const objectives = listObjectivesForTopic(topicId);
    const progress = await this.getObjectivesProgress(
      studentId,
      objectives.map((objective) => objective.id),
      cutoff,
    );

    const summary: TopicProgressSummary = {
      objectiveCount: progress.length,
      coverage: { notSeen: 0, introduced: 0, engaged: 0, practised: 0 },
      mastery: { notStarted: 0, introduced: 0, developing: 0, mastered: 0 },
      performance: { insufficientData: 0, struggling: 0, unstable: 0, stable: 0 },
    };

    for (const item of progress) {
      if (item.coverage === 'NOT_SEEN') summary.coverage.notSeen += 1;
      else if (item.coverage === 'INTRODUCED') summary.coverage.introduced += 1;
      else if (item.coverage === 'ENGAGED') summary.coverage.engaged += 1;
      else summary.coverage.practised += 1;

      if (item.mastery.state === 'NOT_STARTED') summary.mastery.notStarted += 1;
      else if (item.mastery.state === 'INTRODUCED') summary.mastery.introduced += 1;
      else if (item.mastery.state === 'DEVELOPING') summary.mastery.developing += 1;
      else summary.mastery.mastered += 1;

      if (item.performance.state === 'INSUFFICIENT_DATA') summary.performance.insufficientData += 1;
      else if (item.performance.state === 'STRUGGLING') summary.performance.struggling += 1;
      else if (item.performance.state === 'UNSTABLE') summary.performance.unstable += 1;
      else summary.performance.stable += 1;
    }

    return summary;
  }
}
