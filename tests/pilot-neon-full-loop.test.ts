import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  AdaptiveLearningService,
  CorrectionPerformanceRiskFacts,
} from '@/lib/adaptation';
import {
  CorrectionAttemptObserver,
  CorrectionServiceImpl,
  RepositoryAttemptProblemResolver,
} from '@/lib/correction';
import type { ReasoningCheckSpec } from '@/lib/correction';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
  MistakeDiagnosisContext,
  TrustedCorrectionContext,
} from '@/lib/providers/correction';
import { ParentProgressService } from '@/lib/progress';
import { StrategyRecorder } from '@/lib/strategy';
import { PilotReviewService } from '@/lib/pilot';
import { PracticeServiceImpl } from '@/lib/practice';
import type { AnswerSpec, PracticeIdFactory, PracticeItem, PracticeSession } from '@/lib/practice';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonAdaptiveRepository } from '@/lib/persistence/neon-adaptive-repository';
import { NeonMistakeRepository } from '@/lib/persistence/neon-correction-repository';
import { NeonHomeworkRepository } from '@/lib/persistence/neon-homework-repository';
import { NeonLearningStateRepository } from '@/lib/persistence/neon-learning-state-repository';
import { NeonPlanningRepository } from '@/lib/persistence/neon-planning-repository';
import { NeonPracticeRepository } from '@/lib/persistence/neon-practice-repository';
import { NeonStrategyRepository } from '@/lib/persistence/neon-strategy-repository';
import {
  adaptiveDecisions,
  attempts,
  correctionItems,
  correctionReasoningChecks,
  currentPositions,
  dailyLessons,
  evidenceRecords,
  homeworkConfirmations,
  homeworkProblems,
  homeworkSubmissions,
  lessonBriefs,
  lessonExecutionEvents,
  lessonSupersessions,
  mistakeAttemptLinks,
  mistakeEvents,
  mistakes,
  practiceHintReveals,
  practiceItems,
  practiceSessions,
  strategyEvidence,
  strategyInteractions,
  students,
  weeklyPlans,
} from '@/lib/persistence/schema';

const describeLive = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const BASE = Date.parse('2026-08-28T08:00:00.000Z');
const at = (minute: number) => new Date(BASE + minute * 60_000).toISOString();
const OBJECTIVE = 'P3-FRA-003';

class FixtureCorrectionProvider implements CorrectionAIProvider {
  async proposeDiagnosis(_context: MistakeDiagnosisContext): Promise<DiagnosisCandidate> {
    return {
      target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
      rationale: 'Deterministic Phase 8 Neon contract candidate.',
    };
  }

  async prepareGuidance(_context: TrustedCorrectionContext): Promise<CorrectionGuidance> {
    return {
      diagnosisExplanation: 'Compare the size of equal-whole fraction parts.',
      socraticPrompts: ['Which part is larger?'],
    };
  }
}

function answerText(spec: AnswerSpec): string {
  switch (spec.kind) {
    case 'INTEGER':
    case 'DECIMAL': return spec.value;
    case 'FRACTION': return `${spec.numerator}/${spec.denominator}`;
    case 'CHOICE': return spec.optionId;
    case 'EXACT_TEXT': return spec.acceptedValues[0]!;
  }
}

function reasoningResponse(spec: ReasoningCheckSpec): Record<string, string> {
  return spec.kind === 'CHOICE' ? { optionId: spec.expectedOptionId } : structuredClone(spec.expected);
}

async function cleanupStudent(
  db: ReturnType<typeof createNeonDatabase>,
  studentId: string,
): Promise<void> {
  const mistakeRows = await db.select({ id: mistakes.id }).from(mistakes).where(eq(mistakes.studentId, studentId));
  const mistakeIds = mistakeRows.map((row) => row.id);

  await db.delete(lessonSupersessions).where(eq(lessonSupersessions.studentId, studentId));
  await db.delete(adaptiveDecisions).where(eq(adaptiveDecisions.studentId, studentId));
  await db.delete(correctionReasoningChecks).where(eq(correctionReasoningChecks.studentId, studentId));
  await db.delete(correctionItems).where(eq(correctionItems.studentId, studentId));
  if (mistakeIds.length > 0) {
    await db.delete(mistakeAttemptLinks).where(inArray(mistakeAttemptLinks.mistakeId, mistakeIds));
    await db.delete(mistakeEvents).where(inArray(mistakeEvents.mistakeId, mistakeIds));
  }
  await db.delete(mistakes).where(eq(mistakes.studentId, studentId));
  await db.delete(attempts).where(eq(attempts.studentId, studentId));

  await db.delete(homeworkConfirmations).where(eq(homeworkConfirmations.studentId, studentId));
  await db.delete(homeworkProblems).where(eq(homeworkProblems.studentId, studentId));
  await db.delete(homeworkSubmissions).where(eq(homeworkSubmissions.studentId, studentId));

  await db.delete(practiceHintReveals).where(eq(practiceHintReveals.studentId, studentId));
  await db.delete(practiceItems).where(eq(practiceItems.studentId, studentId));
  await db.delete(practiceSessions).where(eq(practiceSessions.studentId, studentId));

  await db.delete(strategyEvidence).where(eq(strategyEvidence.studentId, studentId));
  await db.delete(strategyInteractions).where(eq(strategyInteractions.studentId, studentId));
  await db.delete(lessonExecutionEvents).where(eq(lessonExecutionEvents.studentId, studentId));
  await db.delete(lessonBriefs).where(eq(lessonBriefs.studentId, studentId));
  await db.delete(dailyLessons).where(eq(dailyLessons.studentId, studentId));
  await db.delete(weeklyPlans).where(eq(weeklyPlans.studentId, studentId));
  await db.delete(evidenceRecords).where(eq(evidenceRecords.studentId, studentId));
  await db.delete(currentPositions).where(eq(currentPositions.studentId, studentId));
  await db.delete(students).where(eq(students.id, studentId));
}

function makePracticeItem(
  studentId: string,
  session: PracticeSession,
  sequence: number,
  id: string,
): PracticeItem {
  return {
    id,
    sessionId: session.id,
    studentId,
    objectiveId: OBJECTIVE,
    sequence,
    difficultyBand: 'CORE',
    problemSpec: {
      kind: 'FRACTION_COMPARE',
      leftNumerator: 1,
      leftDenominator: 8,
      rightNumerator: 1,
      rightDenominator: 4,
    },
    answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
    prompt: `Compare 1/8 and 1/4 (${sequence}).`,
    hint: 'Use equal wholes.',
    solutionOutline: ['1/8 < 1/4'],
    generator: 'phase8-neon-contract',
    generatorVersion: 'phase8-neon-contract-v1',
    createdAt: session.createdAt,
  };
}

async function resolveMistake(
  correction: CorrectionServiceImpl,
  mistakeId: string,
  id: (name: string) => string,
  stem: string,
  startMinute: number,
): Promise<void> {
  const start = await correction.startCorrection(mistakeId, at(startMinute));
  await correction.submitCorrectionRetry({
    mistakeId,
    correctionItemId: start.item.id,
    attemptId: id(`${stem}:retry`),
    answerText: answerText(start.item.answerSpec),
  }, at(startMinute + 1));
  for (const [index, check] of start.reasoningChecks.entries()) {
    await correction.submitReasoningCheck({
      mistakeId,
      checkId: check.id,
      submissionId: id(`${stem}:reasoning:${index + 1}`),
      response: reasoningResponse(check),
    }, at(startMinute + 2));
  }
  const transfer = await correction.prepareTransfer(mistakeId, at(startMinute + 3));
  await correction.submitTransferAttempt({
    mistakeId,
    correctionItemId: transfer.id,
    attemptId: id(`${stem}:transfer`),
    answerText: answerText(transfer.answerSpec),
  }, at(startMinute + 4));
  expect((await correction.getMistake(mistakeId)).state).toBe('RESOLVED');
}

async function seedPrerequisiteMastery(
  learning: NeonLearningStateRepository,
  studentId: string,
  objectiveId: string,
  id: (name: string) => string,
): Promise<void> {
  for (const [index, type] of ['independent_correct', 'independent_correct', 'application_correct'].entries()) {
    await learning.appendEvidence({
      id: id(`prerequisite:${objectiveId}:${index + 1}`),
      studentId,
      objectiveId,
      type: type as 'independent_correct' | 'application_correct',
      observedAt: at(0),
      recordedAt: at(0),
      origin: { kind: 'PRACTICE', refId: id(`historical:${objectiveId}:${index + 1}`) },
    });
  }
}

describeLive('Phase 8 Neon full pilot loop', () => {
  it('replays the canonical learning loop and cleans up only the unique test student', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');

    const db = createNeonDatabase(databaseUrl);
    const learning = new NeonLearningStateRepository(db);
    const planning = new NeonPlanningRepository(db);
    const practice = new NeonPracticeRepository(db);
    const homework = new NeonHomeworkRepository(db);
    const mistakeRepository = new NeonMistakeRepository(db);
    const strategy = new NeonStrategyRepository(db);
    const adaptive = new NeonAdaptiveRepository(db);
    const suffix = randomUUID();
    const studentId = `phase8-pilot-${suffix}`;
    const id = (name: string) => `${name}:${suffix}`;
    let studentInserted = false;

    try {
      await learning.saveStudent({
        id: studentId,
        displayName: 'Phase 8 Neon Pilot Learner',
        levelId: 'P3',
        learningMode: 'STRUCTURED_HOME_LEARNING',
        sessionsPerWeek: 4,
        minutesPerSession: 30,
        createdAt: at(0),
        updatedAt: at(0),
      });
      studentInserted = true;
      await learning.setCurrentPosition({
        studentId,
        levelId: 'P3',
        objectiveId: OBJECTIVE,
        recordedAt: at(0),
        source: 'MANUAL_SETUP',
      });
      await seedPrerequisiteMastery(learning, studentId, 'P2-FRA-003', id);
      await seedPrerequisiteMastery(learning, studentId, 'P3-FRA-001', id);
      await seedPrerequisiteMastery(learning, studentId, 'P2-MD-004', id);

      const plan: WeeklyPlan = {
        id: id('plan'),
        studentId,
        weekStart: '2026-08-24',
        sessionsPerWeek: 4,
        minutesPerSession: 30,
        createdAt: at(1),
      };
      const lessons: DailyLesson[] = [
        { id: id('learn'), weeklyPlanId: plan.id, studentId, sequence: 1, intent: 'LEARN', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(1) },
        { id: id('practice'), weeklyPlanId: plan.id, studentId, sequence: 2, intent: 'PRACTICE', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(1) },
        { id: id('adaptive-source'), weeklyPlanId: plan.id, studentId, sequence: 3, intent: 'PRACTICE', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(1) },
        { id: id('forward-learn'), weeklyPlanId: plan.id, studentId, sequence: 4, intent: 'LEARN', objectiveIds: ['P3-FRA-004'], estimatedMinutes: 30, rationale: [{ code: 'NEXT_IN_SEQUENCE', objectiveId: 'P3-FRA-004' }], createdAt: at(1) },
      ];
      await planning.createWeeklyPlan(plan, lessons);
      await planning.appendExecutionEvent({ id: id('learn-start'), lessonId: lessons[0]!.id, studentId, type: 'STARTED', occurredAt: at(2) });
      await planning.appendExecutionEvent({ id: id('learn-done'), lessonId: lessons[0]!.id, studentId, type: 'COMPLETED', occurredAt: at(3), actualMinutes: 25 });
      await planning.appendExecutionEvent({ id: id('practice-start'), lessonId: lessons[1]!.id, studentId, type: 'STARTED', occurredAt: at(4) });

      const correction = new CorrectionServiceImpl(
        mistakeRepository,
        practice,
        learning,
        new RepositoryAttemptProblemResolver(practice, homework, learning),
        new FixtureCorrectionProvider(),
      );
      const practiceIds: PracticeIdFactory = {
        sessionId: (lessonId, objectiveId) => id(`session:${lessonId}:${objectiveId}`),
        itemId: (sessionId, sequence) => id(`generated:${sessionId}:${sequence}`),
      };
      const practiceService = new PracticeServiceImpl(
        learning,
        planning,
        practice,
        practiceIds,
        new CorrectionAttemptObserver(correction),
      );
      const session: PracticeSession = {
        id: id('session'),
        studentId,
        lessonId: lessons[1]!.id,
        objectiveId: OBJECTIVE,
        policyVersion: 'practice-v1',
        createdAt: at(5),
      };
      const items = [1, 2, 3, 4, 5].map((sequence) => makePracticeItem(studentId, session, sequence, id(`item:${sequence}`)));
      await practice.createPracticeSession(session, items);

      for (let index = 0; index < 4; index += 1) {
        await practiceService.submitAttempt({
          attemptId: id(`root-wrong-${index + 1}`),
          sessionId: session.id,
          itemId: items[index]!.id,
          answerText: '>',
        }, at(6 + index));
      }
      await planning.appendExecutionEvent({ id: id('practice-done'), lessonId: lessons[1]!.id, studentId, type: 'COMPLETED', occurredAt: at(10), actualMinutes: 30 });

      await new StrategyRecorder(strategy).record({
        interactionId: id('strategy-interaction'),
        evidenceId: id('strategy-evidence'),
        studentId,
        objectiveId: OBJECTIVE,
        strategyId: 'STRAT-DRAW-DIAGRAM',
        sourceKind: 'PRACTICE',
        sourceRefId: id('root-wrong-1'),
        assistanceRevealed: false,
        interactionKind: 'CONSTRUCTION',
        structurallyValid: true,
      }, at(10));

      const [firstMistake] = await correction.listOpenMistakes(studentId);
      expect(firstMistake).toMatchObject({
        state: 'CONFIRMED',
        confirmedTarget: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
      });
      await resolveMistake(correction, firstMistake!.mistake.id, id, 'first', 11);

      await practiceService.submitAttempt({
        attemptId: id('root-recurrence'),
        sessionId: session.id,
        itemId: items[4]!.id,
        answerText: '>',
      }, at(16));
      const [recurrentMistake] = await correction.listOpenMistakes(studentId);
      expect(recurrentMistake!.mistake.id).not.toBe(firstMistake!.mistake.id);

      const riskFacts = new CorrectionPerformanceRiskFacts({ mistakes: mistakeRepository, practice, learning });
      let now = at(17);
      const adaptiveService = new AdaptiveLearningService({
        learningRepository: learning,
        practiceRepository: practice,
        planningRepository: planning,
        mistakeRepository,
        strategyRepository: strategy,
        adaptiveRepository: adaptive,
        performanceRiskFacts: riskFacts,
        clock: { now: () => now },
        ids: {
          decisionId: (sourceLessonId, cutoff) => id(`decision:${sourceLessonId}:${cutoff}`),
          replacementLessonId: (sourceLessonId, cutoff) => id(`replacement:${sourceLessonId}:${cutoff}`),
          supersessionId: (sourceLessonId) => id(`supersession:${sourceLessonId}`),
        },
      });

      const beforeDecisionProgress = new ParentProgressService({
        learning,
        planning,
        practice,
        mistakes: mistakeRepository,
        strategy,
        adaptive,
        riskFacts,
      });
      const beforeDecisionReview = await new PilotReviewService({
        parentProgress: beforeDecisionProgress,
        planning,
        adaptive,
      }).getReview(studentId, at(16));
      expect(beforeDecisionReview.recentAdaptiveDecisions).toEqual([]);
      expect(beforeDecisionReview.nextLesson).toMatchObject({
        lessonId: lessons[2]!.id,
        intent: 'PRACTICE',
        adapted: false,
      });

      const adapted = await adaptiveService.evaluateLesson(lessons[2]!.id, studentId);
      expect(adapted.decision).toMatchObject({
        action: 'SUPERSEDE',
        selectedIntent: 'CORRECTION',
        targetMistakeId: recurrentMistake!.mistake.id,
      });
      expect(adapted.decision.rationaleCodes).toEqual(expect.arrayContaining(['BLOCKING_MISTAKE', 'RECURRENT_MISTAKE']));

      const parentProgress = new ParentProgressService({
        learning,
        planning,
        practice,
        mistakes: mistakeRepository,
        strategy,
        adaptive,
        riskFacts,
      });
      const parentView = await parentProgress.getView(studentId, now);
      const objective = parentView.topics.flatMap((topic) => topic.objectives)
        .find((entry) => entry.objectiveId === OBJECTIVE);
      expect(objective).toMatchObject({ coverage: 'PRACTISED', mastery: 'DEVELOPING', performance: 'STRUGGLING' });
      expect(parentView.strategies.find((entry) => entry.strategyId === 'STRAT-DRAW-DIAGRAM'))
        .toMatchObject({ state: 'DEVELOPING', independentUseCount: 1 });
      expect(parentView.summary.recurrentMistakes).toBe(1);

      const currentReview = await new PilotReviewService({
        parentProgress,
        planning,
        adaptive,
      }).getReview(studentId, now);
      expect(currentReview.recentAdaptiveDecisions).toEqual([
        expect.objectContaining({
          decisionId: adapted.decision.id,
          action: 'SUPERSEDE',
          inputFactCutoff: at(17),
        }),
      ]);
      expect(currentReview.nextLesson).toMatchObject({
        lessonId: adapted.effectiveLesson.lesson.id,
        intent: 'CORRECTION',
        adapted: true,
        originalLessonId: lessons[2]!.id,
        targetMistakeId: recurrentMistake!.mistake.id,
      });

      await resolveMistake(correction, recurrentMistake!.mistake.id, id, 'recurrence', 18);
      await planning.appendExecutionEvent({ id: id('replacement-start'), lessonId: adapted.effectiveLesson.lesson.id, studentId, type: 'STARTED', occurredAt: at(23) });
      await planning.appendExecutionEvent({ id: id('replacement-done'), lessonId: adapted.effectiveLesson.lesson.id, studentId, type: 'COMPLETED', occurredAt: at(24), actualMinutes: 20 });

      now = at(25);
      const forward = await adaptiveService.evaluateNextPlannedLesson(studentId);
      expect(forward).not.toBeNull();
      expect(forward!.effectiveLesson.lesson.id).toBe(lessons[3]!.id);
      expect(forward!.decision).toMatchObject({ action: 'KEEP', selectedIntent: 'LEARN' });
      expect(await correction.listOpenMistakes(studentId)).toHaveLength(0);
    } finally {
      if (studentInserted) await cleanupStudent(db, studentId);
    }

    const remaining = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.id, studentId), eq(students.displayName, 'Phase 8 Neon Pilot Learner')));
    expect(remaining).toEqual([]);
  }, 60_000);
});
