import { loadCurriculumDataset } from '@/lib/curriculum';
import {
  deriveMisconceptionSummary,
  toParentMistakeGroups,
} from '@/lib/correction';
import type {
  MistakeProjectionInput,
  MistakeRepository,
  ParentMistakeGroups,
} from '@/lib/correction';
import type { LearningStateRepository, MasteryState, StudentLevel } from '@/lib/learning';
import { listLevelObjectivesInCurriculumOrder } from '@/lib/planning';
import type { PlanningRepository } from '@/lib/planning';
import type { PracticeRepository } from '@/lib/practice';
import {
  findNextEffectiveLesson,
  toParentNextLessonView,
} from '@/lib/adaptation';
import type { AdaptiveRepository, NextLessonView } from '@/lib/adaptation';
import { deriveStrategyProgress } from '@/lib/strategy';
import type { StrategyProgressState, StrategyRepository } from '@/lib/strategy';
import { ProgressService } from './service';
import type { CoverageState, PerformanceRiskFacts, PerformanceState } from './types';

export interface ObjectiveProgressView {
  objectiveId: string;
  title: string;
  coverage: CoverageState;
  mastery: MasteryState;
  performance: PerformanceState;
  reviewDue: boolean;
}

export interface TopicProgressView {
  topicId: string;
  title: string;
  objectives: ObjectiveProgressView[];
}

export interface StrategyProgressView {
  strategyId: string;
  state: StrategyProgressState;
  evidenceCount: number;
  independentUseCount: number;
  independentTransferCount: number;
  objectiveCount: number;
  lastObservedAt: string | null;
}

export interface ProgressSummary {
  objectivesIntroduced: number;
  objectivesPractised: number;
  objectivesMastered: number;
  strugglingObjectives: number;
  reviewDueObjectives: number;
  activeMistakes: number;
  recurrentMistakes: number;
  observedStrategies: number;
  developingStrategies: number;
  reliableStrategies: number;
}

export interface ParentProgressView {
  studentId: string;
  levelId: StudentLevel;
  evaluatedAt: string;
  summary: ProgressSummary;
  topics: TopicProgressView[];
  strategies: StrategyProgressView[];
  mistakes: ParentMistakeGroups;
  nextLesson: NextLessonView | null;
}

export interface BuildParentProgressViewInput {
  studentId: string;
  levelId: StudentLevel;
  evaluatedAt: string;
  topics: TopicProgressView[];
  strategies: StrategyProgressView[];
  mistakes: ParentMistakeGroups;
  nextLesson: NextLessonView | null;
}

export interface ParentProgressServiceDependencies {
  learning: LearningStateRepository;
  planning: PlanningRepository;
  practice: PracticeRepository;
  mistakes: MistakeRepository;
  strategy: StrategyRepository;
  adaptive: AdaptiveRepository;
  riskFacts: PerformanceRiskFacts;
}

function factAvailable(observedAt: string, recordedAt: string, cutoff: string): boolean {
  return Date.parse(observedAt) <= Date.parse(cutoff) && Date.parse(recordedAt) <= Date.parse(cutoff);
}

export function buildParentProgressView(input: BuildParentProgressViewInput): ParentProgressView {
  const objectives = input.topics.flatMap((topic) => topic.objectives);
  const activeMistakes = input.mistakes.active.reduce((sum, mistake) => sum + mistake.activeEpisodeCount, 0);
  const recurrentMistakes = input.mistakes.recurring.reduce((sum, mistake) => sum + mistake.recurrenceCount, 0);
  return {
    studentId: input.studentId,
    levelId: input.levelId,
    evaluatedAt: input.evaluatedAt,
    summary: {
      objectivesIntroduced: objectives.filter((objective) => objective.coverage !== 'NOT_SEEN').length,
      objectivesPractised: objectives.filter((objective) => objective.coverage === 'PRACTISED').length,
      objectivesMastered: objectives.filter((objective) => objective.mastery === 'MASTERED').length,
      strugglingObjectives: objectives.filter((objective) => objective.performance === 'STRUGGLING').length,
      reviewDueObjectives: objectives.filter((objective) => objective.reviewDue).length,
      activeMistakes,
      recurrentMistakes,
      observedStrategies: input.strategies.filter((strategy) => strategy.state !== 'NOT_OBSERVED').length,
      developingStrategies: input.strategies.filter((strategy) => strategy.state === 'DEVELOPING').length,
      reliableStrategies: input.strategies.filter((strategy) => strategy.state === 'RELIABLE').length,
    },
    topics: structuredClone(input.topics),
    strategies: structuredClone(input.strategies),
    mistakes: structuredClone(input.mistakes),
    nextLesson: input.nextLesson ? structuredClone(input.nextLesson) : null,
  };
}

export class ParentProgressService {
  private readonly progress: ProgressService;

  constructor(private readonly dependencies: ParentProgressServiceDependencies) {
    this.progress = new ProgressService({
      learning: dependencies.learning,
      planning: dependencies.planning,
      practice: dependencies.practice,
      riskFacts: dependencies.riskFacts,
    });
  }

  async getView(studentId: string, evaluatedAt: string): Promise<ParentProgressView> {
    if (!evaluatedAt || Number.isNaN(Date.parse(evaluatedAt))) throw new Error('evaluatedAt must be a valid ISO date-time string');
    const student = await this.dependencies.learning.getStudent(studentId);
    if (!student) throw new Error(`Unknown student id: ${studentId}`);
    const dataset = loadCurriculumDataset();
    const objectives = listLevelObjectivesInCurriculumOrder(student.levelId, dataset);
    const byTopic = new Map<string, ObjectiveProgressView[]>();

    for (const objective of objectives) {
      const progress = await this.progress.getObjectiveProgress(studentId, objective.id, evaluatedAt);
      const view: ObjectiveProgressView = {
        objectiveId: objective.id,
        title: objective.title,
        coverage: progress.coverage,
        mastery: progress.mastery.state,
        performance: progress.performance.state,
        reviewDue: progress.reviewDue,
      };
      byTopic.set(objective.topicId, [...(byTopic.get(objective.topicId) ?? []), view]);
    }

    const topics: TopicProgressView[] = [...byTopic.entries()].map(([topicId, topicObjectives]) => {
      const node = dataset.nodes.find((candidate) => candidate.id === topicId && candidate.type === 'topic');
      if (!node) throw new Error(`Unknown curriculum topic id: ${topicId}`);
      return { topicId, title: node.name, objectives: topicObjectives };
    });

    const strategyIds = [...new Set(objectives.flatMap((objective) => objective.strategyIds))].sort();
    const strategyEvidence = await this.dependencies.strategy.listEvidenceForStudent(studentId, evaluatedAt);
    const strategies: StrategyProgressView[] = strategyIds.map((strategyId) => {
      const snapshot = deriveStrategyProgress(
        strategyId,
        strategyEvidence.filter((record) => record.strategyId === strategyId),
      );
      return {
        strategyId,
        state: snapshot.state,
        evidenceCount: snapshot.evidenceCount,
        independentUseCount: snapshot.independentUseCount,
        independentTransferCount: snapshot.independentTransferCount,
        objectiveCount: snapshot.objectiveCount,
        lastObservedAt: snapshot.lastObservedAt,
      };
    });

    const mistakes = await this.projectMistakes(studentId, evaluatedAt);
    const next = await findNextEffectiveLesson(
      this.dependencies.planning,
      this.dependencies.adaptive,
      studentId,
      evaluatedAt,
    );
    const nextLesson = next
      ? toParentNextLessonView({ effectiveLesson: next.effectiveLesson, decision: next.decision })
      : null;

    return buildParentProgressView({
      studentId,
      levelId: student.levelId,
      evaluatedAt,
      topics,
      strategies,
      mistakes,
      nextLesson,
    });
  }

  private async projectMistakes(studentId: string, cutoff: string): Promise<ParentMistakeGroups> {
    const mistakes = (await this.dependencies.mistakes.listMistakesForStudent(studentId))
      .filter((mistake) => Date.parse(mistake.firstObservedAt) <= Date.parse(cutoff)
        && Date.parse(mistake.createdAt) <= Date.parse(cutoff));
    const inputs: MistakeProjectionInput[] = [];
    for (const mistake of mistakes) {
      const events = (await this.dependencies.mistakes.listEvents(mistake.id))
        .filter((event) => Date.parse(event.occurredAt) <= Date.parse(cutoff));
      const links = (await this.dependencies.mistakes.listAttemptLinks(mistake.id))
        .filter((link) => Date.parse(link.linkedAt) <= Date.parse(cutoff));
      const attempts = (await Promise.all(links.map((link) => this.dependencies.practice.getAttempt(link.attemptId))))
        .filter((attempt): attempt is NonNullable<typeof attempt> =>
          attempt !== undefined && factAvailable(attempt.submittedAt, attempt.recordedAt, cutoff));
      const evidence = (await this.dependencies.learning.listEvidenceForObjective(studentId, mistake.objectiveId))
        .filter((record) => factAvailable(record.observedAt, record.recordedAt, cutoff));
      const correctionItems = (await this.dependencies.mistakes.listCorrectionItems(mistake.id))
        .filter((item) => Date.parse(item.createdAt) <= Date.parse(cutoff));
      const reasoningChecks = (await this.dependencies.mistakes.listReasoningChecks(mistake.id))
        .filter((check) => factAvailable(check.submittedAt, check.recordedAt, cutoff));
      inputs.push({ mistake, events, links, attempts, evidence, correctionItems, reasoningChecks });
    }
    return toParentMistakeGroups(deriveMisconceptionSummary(inputs));
  }
}
