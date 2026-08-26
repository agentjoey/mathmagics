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
    const plans = await this.dependencies.planning.listWeeklyPlansForStudent(studentId);
    const completed: Array<{ lessonId: string; objectiveIds: string[] }> = [];

    for (const plan of plans) {
      if (Date.parse(plan.createdAt) > Date.parse(cutoff)) continue;
      const lessons = await this.dependencies.planning.listDailyLessonsForPlan(plan.id);
      for (const lesson of lessons) {
        if (lesson.intent !== 'LEARN' || Date.parse(lesson.createdAt) > Date.parse(cutoff)) continue;
        const events = (await this.dependencies.planning.listExecutionEvents(lesson.id))
          .filter((event) => Date.parse(event.occurredAt) <= Date.parse(cutoff));
        const state = deriveLessonExecutionState(lesson.id, events);
        if (state.status === 'COMPLETED') {
          completed.push({ lessonId: lesson.id, objectiveIds: [...lesson.objectiveIds] });
        }
      }
    }

    return completed;
  }

  async getObjectiveProgress(studentId: string, objectiveId: string, cutoff: string): Promise<ObjectiveProgress> {
    requireCutoff(cutoff);
    const student = await this.dependencies.learning.getStudent(studentId);
    if (!student) throw new Error(`Unknown student id: ${studentId}`);

    const objective = getLearningObjective(objectiveId);
    const evidence = (await this.dependencies.learning.listEvidenceForObjective(studentId, objectiveId))
      .filter((record) => evidenceAvailable(record, cutoff));
    const attempts = (await this.dependencies.practice.listAttemptsForStudent(studentId))
      .filter((attempt) => attempt.objectiveId === objectiveId && attemptAvailable(attempt, cutoff));
    const completedLearnLessons = await this.completedLearnLessons(studentId, cutoff);
    const recurrenceCount = await this.dependencies.riskFacts.recurrenceCount(studentId, objectiveId, cutoff);
    const hasBlockingMistake = await this.dependencies.riskFacts.hasBlockingMistake(studentId, objectiveId, cutoff);

    const mastery = deriveMastery(studentId, objectiveId, evidence);
    const coverage = deriveCoverage({
      objectiveId,
      evidence,
      rootAttempts: attempts,
      completedLearnLessons,
    });
    const performance = derivePerformance({
      attempts,
      evaluatedAt: cutoff,
      recurrenceCount,
      hasBlockingMistake,
    });

    return {
      studentId,
      objectiveId,
      coverage,
      mastery,
      performance,
      reviewDue: mastery.reviewDue,
      strategyIds: [...objective.strategyIds],
    };
  }

  async getTopicProgress(studentId: string, topicId: string, cutoff: string): Promise<TopicProgressSummary> {
    requireCutoff(cutoff);
    const objectives = listObjectivesForTopic(topicId);
    const progress = await Promise.all(
      objectives.map((objective) => this.getObjectiveProgress(studentId, objective.id, cutoff)),
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
