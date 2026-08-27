import { getLearningObjective, getPrerequisites } from '@/lib/curriculum';
import {
  classifyReadiness,
  deriveMastery,
} from '@/lib/learning';
import type {
  EvidenceRecord,
  LearningStateRepository,
  ObjectiveReadiness,
  StudentLevel,
} from '@/lib/learning';
import {
  canonicalMistakeId,
  confirmedDiagnosisTarget,
  projectMistakeState,
} from '@/lib/correction';
import type {
  Mistake,
  MistakeProjectionInput,
  MistakeRepository,
} from '@/lib/correction';
import {
  deriveLessonExecutionState,
  listLevelObjectivesInCurriculumOrder,
} from '@/lib/planning';
import type {
  DailyLesson,
  PlanningRepository,
} from '@/lib/planning';
import type { Attempt, PracticeRepository } from '@/lib/practice';
import { ProgressService } from '@/lib/progress';
import type {
  ObjectiveProgress,
  PerformanceRiskFacts,
  PerformanceRiskSnapshot,
} from '@/lib/progress';
import { deriveStrategyProgress } from '@/lib/strategy';
import type { StrategyEvidence, StrategyRepository } from '@/lib/strategy';
import { listAdaptiveCandidates } from './candidates';
import type {
  AdaptiveCandidateInput,
  AdaptiveMistakeNeed,
  AdaptivePrerequisiteNeed,
  AdaptiveReviewNeed,
} from './candidates';
import type { EffectiveLesson } from './effective-lesson';
import { deriveMistakePriority } from './mistake-priority';
import { selectAdaptiveRecommendation } from './policy';
import type { AdaptiveRepository } from './repository';
import { deriveStarvationGuard } from './starvation';
import type { AdaptiveLessonHistoryFact } from './starvation';
import type { AdaptiveDecision, LessonSupersession } from './types';

export interface AdaptiveServiceDependencies {
  learningRepository: LearningStateRepository;
  practiceRepository: PracticeRepository;
  planningRepository: PlanningRepository;
  mistakeRepository: MistakeRepository;
  strategyRepository: StrategyRepository;
  adaptiveRepository: AdaptiveRepository;
  performanceRiskFacts: PerformanceRiskFacts;
  clock: { now(): string };
  ids: {
    decisionId(sourceLessonId: string, cutoff: string): string;
    replacementLessonId(sourceLessonId: string, cutoff: string): string;
    supersessionId(sourceLessonId: string): string;
  };
}

export interface AdaptiveEvaluationResult {
  decision: AdaptiveDecision;
  effectiveLesson: EffectiveLesson;
}

interface EffectiveLessonAtCutoff extends EffectiveLesson {
  weekStart: string;
}

function requireCutoff(cutoff: string): void {
  if (!cutoff || Number.isNaN(Date.parse(cutoff))) {
    throw new Error('adaptive cutoff must be a valid ISO date-time string');
  }
}

function evidenceAvailable(record: EvidenceRecord, cutoff: string): boolean {
  return Date.parse(record.observedAt) <= Date.parse(cutoff)
    && Date.parse(record.recordedAt) <= Date.parse(cutoff);
}

function attemptAvailable(attempt: Attempt, cutoff: string): boolean {
  return Date.parse(attempt.submittedAt) <= Date.parse(cutoff)
    && Date.parse(attempt.recordedAt) <= Date.parse(cutoff);
}

function compareEffective(left: EffectiveLessonAtCutoff, right: EffectiveLessonAtCutoff): number {
  return left.weekStart.localeCompare(right.weekStart)
    || left.lesson.sequence - right.lesson.sequence
    || left.lesson.createdAt.localeCompare(right.lesson.createdAt)
    || left.lesson.id.localeCompare(right.lesson.id);
}

export class AdaptiveLearningService {
  private readonly progress: ProgressService;

  constructor(private readonly dependencies: AdaptiveServiceDependencies) {
    this.progress = new ProgressService({
      learning: dependencies.learningRepository,
      planning: dependencies.planningRepository,
      practice: dependencies.practiceRepository,
      riskFacts: dependencies.performanceRiskFacts,
    });
  }

  async evaluateLesson(sourceLessonId: string, studentId: string): Promise<AdaptiveEvaluationResult> {
    const cutoff = this.dependencies.clock.now();
    requireCutoff(cutoff);
    return this.evaluateLessonAt(sourceLessonId, studentId, cutoff);
  }

  async evaluateNextPlannedLesson(studentId: string): Promise<AdaptiveEvaluationResult | null> {
    const cutoff = this.dependencies.clock.now();
    requireCutoff(cutoff);
    const next = await this.findNextPlannedLesson(studentId, cutoff);
    if (!next) return null;
    return this.evaluateLessonAt(next.lesson.id, studentId, cutoff);
  }

  private async findDecisionById(sourceLessonId: string, decisionId: string): Promise<AdaptiveDecision> {
    const decisions = await this.dependencies.adaptiveRepository.listDecisionsForSourceLesson(sourceLessonId);
    const decision = decisions.find((candidate) => candidate.id === decisionId);
    if (!decision) throw new Error(`Dangling adaptive decision id: ${decisionId}`);
    return decision;
  }

  private async effectiveAtCutoff(lesson: DailyLesson, cutoff: string): Promise<EffectiveLesson> {
    const incoming = await this.dependencies.adaptiveRepository.getSupersessionByReplacementLesson(lesson.id);
    if (incoming) {
      if (Date.parse(incoming.createdAt) > Date.parse(cutoff)) {
        throw new Error('replacement lesson did not exist at adaptive cutoff');
      }
      const original = await this.dependencies.planningRepository.getDailyLesson(incoming.sourceLessonId);
      if (!original) throw new Error(`Dangling lesson supersession source: ${incoming.sourceLessonId}`);
      return {
        lesson,
        originalLessonId: original.id,
        adapted: true,
        adaptiveDecisionId: incoming.adaptiveDecisionId,
      };
    }

    const outgoing = await this.dependencies.adaptiveRepository.getSupersessionForSourceLesson(lesson.id);
    if (!outgoing || Date.parse(outgoing.createdAt) > Date.parse(cutoff)) {
      return { lesson, originalLessonId: lesson.id, adapted: false };
    }
    const replacement = await this.dependencies.planningRepository.getDailyLesson(outgoing.replacementLessonId);
    if (!replacement) throw new Error(`Dangling lesson supersession replacement: ${outgoing.replacementLessonId}`);
    return {
      lesson: replacement,
      originalLessonId: lesson.id,
      adapted: true,
      adaptiveDecisionId: outgoing.adaptiveDecisionId,
    };
  }

  private async resultForExistingDecision(
    source: DailyLesson,
    decision: AdaptiveDecision,
    cutoff: string,
  ): Promise<AdaptiveEvaluationResult> {
    if (decision.action === 'KEEP') {
      return {
        decision,
        effectiveLesson: { lesson: source, originalLessonId: source.id, adapted: false },
      };
    }
    const supersession = await this.dependencies.adaptiveRepository.getSupersessionForSourceLesson(source.id);
    if (
      !supersession
      || supersession.adaptiveDecisionId !== decision.id
      || Date.parse(supersession.createdAt) > Date.parse(cutoff)
    ) {
      throw new Error('SUPERSEDE decision is missing its effective supersession at cutoff');
    }
    const replacement = await this.dependencies.planningRepository.getDailyLesson(supersession.replacementLessonId);
    if (!replacement) throw new Error(`Dangling lesson supersession replacement: ${supersession.replacementLessonId}`);
    return {
      decision,
      effectiveLesson: {
        lesson: replacement,
        originalLessonId: source.id,
        adapted: true,
        adaptiveDecisionId: decision.id,
      },
    };
  }

  private async evaluateLessonAt(
    sourceLessonId: string,
    studentId: string,
    cutoff: string,
  ): Promise<AdaptiveEvaluationResult> {
    const requested = await this.dependencies.planningRepository.getDailyLesson(sourceLessonId);
    if (!requested) throw new Error(`Unknown daily lesson id: ${sourceLessonId}`);
    if (requested.studentId !== studentId) throw new Error('daily lesson does not belong to student');
    if (Date.parse(requested.createdAt) > Date.parse(cutoff)) throw new Error('daily lesson did not exist at adaptive cutoff');

    const incoming = await this.dependencies.adaptiveRepository.getSupersessionByReplacementLesson(requested.id);
    if (incoming && Date.parse(incoming.createdAt) <= Date.parse(cutoff)) {
      const decision = await this.findDecisionById(incoming.sourceLessonId, incoming.adaptiveDecisionId);
      return {
        decision,
        effectiveLesson: {
          lesson: requested,
          originalLessonId: incoming.sourceLessonId,
          adapted: true,
          adaptiveDecisionId: decision.id,
        },
      };
    }

    const existingSameKey = await this.dependencies.adaptiveRepository.getDecisionByEvaluationKey(
      studentId,
      requested.id,
      cutoff,
      'adaptive-policy-v1',
    );
    if (existingSameKey) return this.resultForExistingDecision(requested, existingSameKey, cutoff);

    const outgoing = await this.dependencies.adaptiveRepository.getSupersessionForSourceLesson(requested.id);
    if (outgoing) {
      if (Date.parse(outgoing.createdAt) <= Date.parse(cutoff)) {
        const decision = await this.findDecisionById(requested.id, outgoing.adaptiveDecisionId);
        return this.resultForExistingDecision(requested, decision, cutoff);
      }
      throw new Error('historical evaluation before an existing supersession requires a recorded decision');
    }

    const executionEvents = (await this.dependencies.planningRepository.listExecutionEvents(requested.id))
      .filter((event) => Date.parse(event.occurredAt) <= Date.parse(cutoff));
    const execution = deriveLessonExecutionState(requested.id, executionEvents);

    if (execution.status === 'COMPLETED' || execution.status === 'SKIPPED') {
      const next = await this.findNextPlannedLesson(studentId, cutoff, requested);
      if (!next) throw new Error(`No next planned lesson for student ${studentId}`);
      return this.evaluateLessonAt(next.lesson.id, studentId, cutoff);
    }

    if (execution.status === 'STARTED') {
      const decision = this.makeDecision(requested, cutoff, {
        action: 'KEEP',
        intent: requested.intent,
        objectiveIds: [...requested.objectiveIds],
        rationaleCodes: ['SOURCE_LESSON_ALREADY_STARTED'],
      });
      await this.dependencies.adaptiveRepository.appendKeepDecision(decision);
      return this.resultForExistingDecision(requested, decision, cutoff);
    }

    const candidateInput = await this.buildCandidateInput(studentId, requested, cutoff);
    const candidates = listAdaptiveCandidates(candidateInput);
    const history = await this.lessonHistory(studentId, cutoff);
    const starvationGuard = deriveStarvationGuard(history, candidates);
    const recommendation = selectAdaptiveRecommendation(requested, candidates, starvationGuard);
    const decision = this.makeDecision(requested, cutoff, recommendation);

    if (decision.action === 'KEEP') {
      await this.dependencies.adaptiveRepository.appendKeepDecision(decision);
      const persisted = await this.dependencies.adaptiveRepository.getDecisionByEvaluationKey(
        studentId,
        requested.id,
        cutoff,
        'adaptive-policy-v1',
      );
      return this.resultForExistingDecision(requested, persisted ?? decision, cutoff);
    }

    const replacement: DailyLesson = {
      ...requested,
      id: this.dependencies.ids.replacementLessonId(requested.id, cutoff),
      intent: decision.selectedIntent,
      objectiveIds: [...decision.selectedObjectiveIds],
      rationale: structuredClone(requested.rationale),
      createdAt: cutoff,
    };
    const supersession: LessonSupersession = {
      id: this.dependencies.ids.supersessionId(requested.id),
      studentId,
      sourceLessonId: requested.id,
      replacementLessonId: replacement.id,
      adaptiveDecisionId: decision.id,
      createdAt: cutoff,
    };
    await this.dependencies.adaptiveRepository.commitSupersession({
      decision,
      replacementLesson: replacement,
      supersession,
    });

    const persisted = await this.dependencies.adaptiveRepository.getDecisionByEvaluationKey(
      studentId,
      requested.id,
      cutoff,
      'adaptive-policy-v1',
    );
    return this.resultForExistingDecision(requested, persisted ?? decision, cutoff);
  }

  private makeDecision(
    source: DailyLesson,
    cutoff: string,
    recommendation: {
      action: 'KEEP' | 'SUPERSEDE';
      intent: DailyLesson['intent'];
      objectiveIds: string[];
      rationaleCodes: AdaptiveDecision['rationaleCodes'];
      targetMistakeId?: string;
    },
  ): AdaptiveDecision {
    return {
      id: this.dependencies.ids.decisionId(source.id, cutoff),
      studentId: source.studentId,
      sourceLessonId: source.id,
      action: recommendation.action,
      selectedIntent: recommendation.intent,
      selectedObjectiveIds: [...recommendation.objectiveIds],
      ...(recommendation.targetMistakeId ? { targetMistakeId: recommendation.targetMistakeId } : {}),
      rationaleCodes: [...recommendation.rationaleCodes],
      policyVersion: 'adaptive-policy-v1',
      evaluatedAt: cutoff,
      inputFactCutoff: cutoff,
      createdAt: cutoff,
    };
  }

  private async readinessAt(
    studentId: string,
    objectiveId: string,
    progressFor: (objectiveId: string) => Promise<ObjectiveProgress>,
  ): Promise<ObjectiveReadiness> {
    const prerequisiteObjectives = getPrerequisites(objectiveId);
    const statuses = await Promise.all(prerequisiteObjectives.map(async (objective) => {
      const progress = await progressFor(objective.id);
      return {
        objectiveId: objective.id,
        mastery: progress.mastery.state,
        reviewDue: progress.reviewDue,
      };
    }));
    return classifyReadiness(studentId, objectiveId, statuses);
  }

  private async resolveAnchorObjective(
    studentId: string,
    cutoff: string,
    levelId: StudentLevel,
  ): Promise<string> {
    const ordered = listLevelObjectivesInCurriculumOrder(levelId);
    if (ordered.length === 0) throw new Error(`No curriculum objectives for level ${levelId}`);
    const position = await this.dependencies.learningRepository.getCurrentPosition(studentId);
    if (!position || Date.parse(position.recordedAt) > Date.parse(cutoff)) return ordered[0]!.id;
    if (position.objectiveId) {
      const objective = getLearningObjective(position.objectiveId);
      if (objective.levelId !== levelId) throw new Error('current position objective is outside student level');
      return objective.id;
    }
    if (position.topicId) {
      const first = ordered.find((objective) => objective.topicId === position.topicId);
      if (!first) throw new Error(`Current position topic ${position.topicId} has no objectives`);
      return first.id;
    }
    return ordered[0]!.id;
  }

  private async strategyNeedsDevelopment(
    objectiveId: string,
    evidence: StrategyEvidence[],
  ): Promise<boolean> {
    const objective = getLearningObjective(objectiveId);
    return objective.strategyIds.some((strategyId) => {
      const records = evidence.filter((record) => record.strategyId === strategyId);
      return deriveStrategyProgress(strategyId, records).state === 'DEVELOPING';
    });
  }

  private async buildCandidateInput(
    studentId: string,
    source: DailyLesson,
    cutoff: string,
  ): Promise<AdaptiveCandidateInput> {
    const student = await this.dependencies.learningRepository.getStudent(studentId);
    if (!student) throw new Error(`Unknown student id: ${studentId}`);
    const ordered = listLevelObjectivesInCurriculumOrder(student.levelId);
    const progressObjectiveIds = [...new Set(ordered.flatMap((objective) => [
      objective.id,
      ...getPrerequisites(objective.id).map((prerequisite) => prerequisite.id),
    ]))];
    const anchorId = await this.resolveAnchorObjective(studentId, cutoff, student.levelId);
    const anchorIndex = ordered.findIndex((objective) => objective.id === anchorId);
    if (anchorIndex < 0) throw new Error(`Anchor objective ${anchorId} is outside active curriculum order`);

    const riskSnapshot = this.dependencies.performanceRiskFacts.snapshot
      ? await this.dependencies.performanceRiskFacts.snapshot(studentId, cutoff)
      : undefined;
    const [allProgress, strategyEvidence] = await Promise.all([
      this.progress.getObjectivesProgress(
        studentId,
        progressObjectiveIds,
        cutoff,
        riskSnapshot,
      ),
      this.dependencies.strategyRepository.listEvidenceForStudent(studentId, cutoff),
    ]);
    const progressByObjective = new Map(allProgress.map((progress) => [progress.objectiveId, progress]));
    const progressFor = async (objectiveId: string): Promise<ObjectiveProgress> => {
      const progress = progressByObjective.get(objectiveId);
      if (!progress) throw new Error(`Missing progress snapshot for objective ${objectiveId}`);
      return progress;
    };

    const anchorProgress = await progressFor(anchorId);
    let forwardObjectiveId: string | undefined;
    let current: AdaptiveCandidateInput['current'];
    const next: AdaptiveCandidateInput['next'] = [];
    const prerequisites: AdaptivePrerequisiteNeed[] = [];

    if (anchorProgress.mastery.state !== 'MASTERED') {
      forwardObjectiveId = anchorId;
      const readiness = await this.readinessAt(studentId, anchorId, progressFor);
      for (const prerequisite of readiness.blockingPrerequisites) {
        prerequisites.push({
          objectiveId: prerequisite.objectiveId,
          mastery: prerequisite.mastery,
          reviewDue: prerequisite.reviewDue,
          targetObjectiveId: anchorId,
          targetReadiness: readiness.state === 'READY' ? 'NEEDS_SUPPORT' : readiness.state,
        });
      }
      if (readiness.state !== 'BLOCKED') {
        current = {
          objectiveId: anchorId,
          mastery: anchorProgress.mastery.state,
          reviewDue: anchorProgress.reviewDue,
          performance: anchorProgress.performance.state,
          strategyNeedsDevelopment: await this.strategyNeedsDevelopment(anchorId, strategyEvidence),
        };
      }
    } else {
      for (const objective of ordered.slice(anchorIndex + 1)) {
        const progress = await progressFor(objective.id);
        if (progress.mastery.state === 'MASTERED') continue;
        forwardObjectiveId = objective.id;
        const readiness = await this.readinessAt(studentId, objective.id, progressFor);
        for (const prerequisite of readiness.blockingPrerequisites) {
          prerequisites.push({
            objectiveId: prerequisite.objectiveId,
            mastery: prerequisite.mastery,
            reviewDue: prerequisite.reviewDue,
            targetObjectiveId: objective.id,
            targetReadiness: readiness.state === 'READY' ? 'NEEDS_SUPPORT' : readiness.state,
          });
        }
        next.push({
          objectiveId: objective.id,
          mastery: progress.mastery.state,
          reviewDue: progress.reviewDue,
          readiness: readiness.state,
          performance: progress.performance.state,
          strategyNeedsDevelopment: await this.strategyNeedsDevelopment(objective.id, strategyEvidence),
        });
        break;
      }
    }

    const reviews: AdaptiveReviewNeed[] = [];
    for (const objective of ordered) {
      const progress = await progressFor(objective.id);
      if (progress.mastery.state === 'MASTERED' && progress.reviewDue) {
        reviews.push({
          objectiveId: objective.id,
          mastery: 'MASTERED',
          reviewDue: true,
          performance: progress.performance.state,
        });
      }
    }

    const mistakes = await this.mistakeNeeds(
      studentId,
      forwardObjectiveId ?? source.objectiveIds[0],
      cutoff,
      riskSnapshot,
    );
    return { mistakes, prerequisites, reviews, current, next };
  }

  private async mistakeNeeds(
    studentId: string,
    forwardObjectiveId: string | undefined,
    cutoff: string,
    riskSnapshot?: PerformanceRiskSnapshot,
  ): Promise<AdaptiveMistakeNeed[]> {
    const mistakes = (await this.dependencies.mistakeRepository.listMistakesForStudent(studentId))
      .filter((mistake) => Date.parse(mistake.firstObservedAt) <= Date.parse(cutoff));
    if (mistakes.length === 0) return [];

    const [attempts, evidence] = await Promise.all([
      this.dependencies.practiceRepository.listAttemptsForStudent(studentId)
        .then((records) => records.filter((attempt) => attemptAvailable(attempt, cutoff))),
      this.dependencies.learningRepository.listEvidenceForStudent(studentId)
        .then((records) => records.filter((record) => evidenceAvailable(record, cutoff))),
    ]);
    const needs: AdaptiveMistakeNeed[] = [];

    for (const mistake of mistakes) {
      const [rawEvents, rawLinks, rawCorrectionItems, rawReasoningChecks] = await Promise.all([
        this.dependencies.mistakeRepository.listEvents(mistake.id),
        this.dependencies.mistakeRepository.listAttemptLinks(mistake.id),
        this.dependencies.mistakeRepository.listCorrectionItems(mistake.id),
        this.dependencies.mistakeRepository.listReasoningChecks(mistake.id),
      ]);
      const events = rawEvents.filter((event) => Date.parse(event.occurredAt) <= Date.parse(cutoff));
      if (canonicalMistakeId(events)) continue;
      const links = rawLinks.filter((link) => Date.parse(link.linkedAt) <= Date.parse(cutoff));
      const correctionItems = rawCorrectionItems
        .filter((item) => Date.parse(item.createdAt) <= Date.parse(cutoff));
      const reasoningChecks = rawReasoningChecks
        .filter((check) => Date.parse(check.submittedAt) <= Date.parse(cutoff)
          && Date.parse(check.recordedAt) <= Date.parse(cutoff));
      const input: MistakeProjectionInput = {
        mistake,
        events,
        links,
        attempts,
        evidence,
        correctionItems,
        reasoningChecks,
      };
      const state = projectMistakeState(input);
      if (state === 'RESOLVED') continue;
      const diagnosisTarget = confirmedDiagnosisTarget(events);
      const recurrenceCount = riskSnapshot
        ? riskSnapshot.recurrenceCount(mistake.objectiveId)
        : await this.dependencies.performanceRiskFacts.recurrenceCount(
          studentId,
          mistake.objectiveId,
          cutoff,
        );
      const masteredBeforeMistake = this.masteredBeforeMistake(mistake, evidence);
      const priority = deriveMistakePriority({
        state,
        diagnosisTarget,
        mistakeObjectiveId: mistake.objectiveId,
        forwardObjectiveId,
        recurrent: recurrenceCount > 0,
        masteredBeforeMistake,
      });
      needs.push({
        mistakeId: mistake.id,
        objectiveId: mistake.objectiveId,
        priority,
        recurrent: recurrenceCount > 0,
      });
    }
    return needs;
  }

  private masteredBeforeMistake(mistake: Mistake, evidence: EvidenceRecord[]): boolean {
    const before = evidence.filter((record) =>
      record.objectiveId === mistake.objectiveId
      && Date.parse(record.observedAt) < Date.parse(mistake.firstObservedAt)
      && Date.parse(record.recordedAt) <= Date.parse(mistake.firstObservedAt));
    return deriveMastery(mistake.studentId, mistake.objectiveId, before).state === 'MASTERED';
  }

  private async effectiveLessonsAtCutoff(studentId: string, cutoff: string): Promise<EffectiveLessonAtCutoff[]> {
    const plans = (await this.dependencies.planningRepository.listWeeklyPlansForStudent(studentId))
      .filter((plan) => Date.parse(plan.createdAt) <= Date.parse(cutoff));
    const byEffectiveId = new Map<string, EffectiveLessonAtCutoff>();
    for (const plan of plans) {
      const lessons = (await this.dependencies.planningRepository.listDailyLessonsForPlan(plan.id))
        .filter((lesson) => Date.parse(lesson.createdAt) <= Date.parse(cutoff));
      for (const lesson of lessons) {
        const effective = await this.effectiveAtCutoff(lesson, cutoff);
        if (Date.parse(effective.lesson.createdAt) > Date.parse(cutoff)) continue;
        byEffectiveId.set(effective.lesson.id, { ...effective, weekStart: plan.weekStart });
      }
    }
    return [...byEffectiveId.values()].sort(compareEffective);
  }

  private async lessonHistory(studentId: string, cutoff: string): Promise<AdaptiveLessonHistoryFact[]> {
    const effective = await this.effectiveLessonsAtCutoff(studentId, cutoff);
    const history: AdaptiveLessonHistoryFact[] = [];
    for (const item of effective) {
      const events = (await this.dependencies.planningRepository.listExecutionEvents(item.lesson.id))
        .filter((event) => Date.parse(event.occurredAt) <= Date.parse(cutoff));
      const state = deriveLessonExecutionState(item.lesson.id, events);
      history.push({ intent: item.lesson.intent, status: state.status, effective: true });
    }
    return history;
  }

  private async findNextPlannedLesson(
    studentId: string,
    cutoff: string,
    afterLesson?: DailyLesson,
  ): Promise<EffectiveLessonAtCutoff | null> {
    const effective = await this.effectiveLessonsAtCutoff(studentId, cutoff);
    let afterKey: EffectiveLessonAtCutoff | undefined;
    if (afterLesson) {
      const plan = await this.dependencies.planningRepository.getWeeklyPlan(afterLesson.weeklyPlanId);
      if (!plan) throw new Error(`Unknown weekly plan id: ${afterLesson.weeklyPlanId}`);
      afterKey = {
        lesson: afterLesson,
        originalLessonId: afterLesson.id,
        adapted: false,
        weekStart: plan.weekStart,
      };
    }

    for (const item of effective) {
      if (afterKey && compareEffective(item, afterKey) <= 0) continue;
      const events = (await this.dependencies.planningRepository.listExecutionEvents(item.lesson.id))
        .filter((event) => Date.parse(event.occurredAt) <= Date.parse(cutoff));
      const state = deriveLessonExecutionState(item.lesson.id, events);
      if (state.status === 'PLANNED') return item;
    }
    return null;
  }
}
