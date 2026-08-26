import { describe, expect, it } from 'vitest';
import {
  AdaptiveLearningService,
  CorrectionPerformanceRiskFacts,
  MemoryAdaptiveRepository,
} from '@/lib/adaptation';
import {
  CorrectionAttemptObserver,
  CorrectionServiceImpl,
  MemoryMistakeRepository,
  RepositoryAttemptProblemResolver,
} from '@/lib/correction';
import type { ReasoningCheckSpec } from '@/lib/correction';
import { MemoryHomeworkRepository } from '@/lib/homework';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import type { DailyLesson, WeeklyPlan } from '@/lib/planning';
import { MemoryPracticeRepository, PracticeServiceImpl } from '@/lib/practice';
import type { AnswerSpec, PracticeIdFactory, PracticeItem, PracticeSession } from '@/lib/practice';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
  MistakeDiagnosisContext,
  TrustedCorrectionContext,
} from '@/lib/providers/correction';
import { ParentProgressService } from '@/lib/progress';
import { MemoryStrategyRepository, StrategyRecorder } from '@/lib/strategy';

const BASE = Date.parse('2026-08-26T08:00:00.000Z');
const at = (minute: number) => new Date(BASE + minute * 60_000).toISOString();
const STUDENT = 'student-phase7-full-loop';
const OBJECTIVE = 'P3-FRA-003';

const practiceIds: PracticeIdFactory = {
  sessionId: (lessonId, objectiveId) => `session:${lessonId}:${objectiveId}`,
  itemId: (sessionId, sequence) => `${sessionId}:item:${sequence}`,
};

class FixtureCorrectionProvider implements CorrectionAIProvider {
  async proposeDiagnosis(_context: MistakeDiagnosisContext): Promise<DiagnosisCandidate> {
    return {
      target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
      rationale: 'Deterministic E2E fallback candidate.',
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

async function seedPrerequisiteMastery(
  learning: MemoryLearningStateRepository,
  objectiveId: string,
): Promise<void> {
  for (const [index, type] of ['independent_correct', 'independent_correct', 'application_correct'].entries()) {
    await learning.appendEvidence({
      id: `prerequisite:${objectiveId}:${index + 1}`,
      studentId: STUDENT,
      objectiveId,
      type: type as 'independent_correct' | 'application_correct',
      observedAt: at(0),
      recordedAt: at(0),
      origin: { kind: 'PRACTICE', refId: `historical:${objectiveId}:${index + 1}` },
    });
  }
}

function item(session: PracticeSession, sequence: number): PracticeItem {
  return {
    id: `${session.id}:item:${sequence}`,
    sessionId: session.id,
    studentId: STUDENT,
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
    generator: 'phase7-e2e',
    generatorVersion: 'phase7-e2e-v1',
    createdAt: session.createdAt,
  };
}

async function resolveMistake(
  correction: CorrectionServiceImpl,
  mistakeId: string,
  stem: string,
  startMinute: number,
): Promise<void> {
  const start = await correction.startCorrection(mistakeId, at(startMinute));
  await correction.submitCorrectionRetry({
    mistakeId,
    correctionItemId: start.item.id,
    attemptId: `${stem}:retry`,
    answerText: answerText(start.item.answerSpec),
  }, at(startMinute + 1));
  for (const [index, check] of start.reasoningChecks.entries()) {
    await correction.submitReasoningCheck({
      mistakeId,
      checkId: check.id,
      submissionId: `${stem}:reasoning:${index + 1}`,
      response: reasoningResponse(check),
    }, at(startMinute + 2));
  }
  const transfer = await correction.prepareTransfer(mistakeId, at(startMinute + 3));
  await correction.submitTransferAttempt({
    mistakeId,
    correctionItemId: transfer.id,
    attemptId: `${stem}:transfer`,
    answerText: answerText(transfer.answerSpec),
  }, at(startMinute + 4));
  expect((await correction.getMistake(mistakeId)).state).toBe('RESOLVED');
}

describe('Phase 7 full adaptive learning loop', () => {
  it('tracks separate progress, prioritizes recurrence correction, then resumes forward learning', async () => {
    const learning = new MemoryLearningStateRepository();
    const planning = new MemoryPlanningRepository();
    const practice = new MemoryPracticeRepository();
    const homework = new MemoryHomeworkRepository();
    const mistakes = new MemoryMistakeRepository();
    const strategy = new MemoryStrategyRepository();
    const adaptive = new MemoryAdaptiveRepository(planning);

    await learning.saveStudent({
      id: STUDENT,
      displayName: 'Phase 7 Learner',
      levelId: 'P3',
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: 4,
      minutesPerSession: 30,
      createdAt: at(0),
      updatedAt: at(0),
    });
    await learning.setCurrentPosition({
      studentId: STUDENT,
      levelId: 'P3',
      objectiveId: OBJECTIVE,
      recordedAt: at(0),
      source: 'MANUAL_SETUP',
    });
    await seedPrerequisiteMastery(learning, 'P2-FRA-003');
    await seedPrerequisiteMastery(learning, 'P3-FRA-001');
    await seedPrerequisiteMastery(learning, 'P2-MD-004');

    const plan: WeeklyPlan = {
      id: 'phase7-plan',
      studentId: STUDENT,
      weekStart: '2026-08-24',
      sessionsPerWeek: 4,
      minutesPerSession: 30,
      createdAt: at(1),
    };
    const lessons: DailyLesson[] = [
      { id: 'learn', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 1, intent: 'LEARN', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(1) },
      { id: 'practice', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 2, intent: 'PRACTICE', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(1) },
      { id: 'adaptive-source', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 3, intent: 'PRACTICE', objectiveIds: [OBJECTIVE], estimatedMinutes: 30, rationale: [{ code: 'CURRENT_POSITION', objectiveId: OBJECTIVE }], createdAt: at(1) },
      { id: 'forward-learn', weeklyPlanId: plan.id, studentId: STUDENT, sequence: 4, intent: 'LEARN', objectiveIds: ['P3-FRA-004'], estimatedMinutes: 30, rationale: [{ code: 'NEXT_IN_SEQUENCE', objectiveId: 'P3-FRA-004' }], createdAt: at(1) },
    ];
    await planning.createWeeklyPlan(plan, lessons);
    await planning.appendExecutionEvent({ id: 'learn-start', lessonId: 'learn', studentId: STUDENT, type: 'STARTED', occurredAt: at(2) });
    await planning.appendExecutionEvent({ id: 'learn-done', lessonId: 'learn', studentId: STUDENT, type: 'COMPLETED', occurredAt: at(3), actualMinutes: 25 });
    await planning.appendExecutionEvent({ id: 'practice-start', lessonId: 'practice', studentId: STUDENT, type: 'STARTED', occurredAt: at(4) });

    const correction = new CorrectionServiceImpl(
      mistakes,
      practice,
      learning,
      new RepositoryAttemptProblemResolver(practice, homework, learning),
      new FixtureCorrectionProvider(),
    );
    const practiceService = new PracticeServiceImpl(
      learning,
      planning,
      practice,
      practiceIds,
      new CorrectionAttemptObserver(correction),
    );
    const session: PracticeSession = {
      id: 'phase7-session',
      studentId: STUDENT,
      lessonId: 'practice',
      objectiveId: OBJECTIVE,
      policyVersion: 'practice-v1',
      createdAt: at(5),
    };
    const items = [1, 2, 3, 4, 5].map((sequence) => item(session, sequence));
    await practice.createPracticeSession(session, items);

    for (let index = 0; index < 4; index += 1) {
      await practiceService.submitAttempt({
        attemptId: `root-wrong-${index + 1}`,
        sessionId: session.id,
        itemId: items[index]!.id,
        answerText: '>',
      }, at(6 + index));
    }
    await planning.appendExecutionEvent({ id: 'practice-done', lessonId: 'practice', studentId: STUDENT, type: 'COMPLETED', occurredAt: at(10), actualMinutes: 30 });

    await new StrategyRecorder(strategy).record({
      interactionId: 'strategy-interaction',
      evidenceId: 'strategy-evidence',
      studentId: STUDENT,
      objectiveId: OBJECTIVE,
      strategyId: 'STRAT-DRAW-DIAGRAM',
      sourceKind: 'PRACTICE',
      sourceRefId: 'root-wrong-1',
      assistanceRevealed: false,
      interactionKind: 'CONSTRUCTION',
      structurallyValid: true,
    }, at(10));

    const [firstMistake] = await correction.listOpenMistakes(STUDENT);
    expect(firstMistake).toMatchObject({
      state: 'CONFIRMED',
      confirmedTarget: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
    });
    await resolveMistake(correction, firstMistake!.mistake.id, 'first', 11);

    await practiceService.submitAttempt({
      attemptId: 'root-recurrence',
      sessionId: session.id,
      itemId: items[4]!.id,
      answerText: '>',
    }, at(16));
    const [recurrentMistake] = await correction.listOpenMistakes(STUDENT);
    expect(recurrentMistake!.mistake.id).not.toBe(firstMistake!.mistake.id);

    const riskFacts = new CorrectionPerformanceRiskFacts({ mistakes, practice, learning });
    let now = at(17);
    const adaptiveService = new AdaptiveLearningService({
      learningRepository: learning,
      practiceRepository: practice,
      planningRepository: planning,
      mistakeRepository: mistakes,
      strategyRepository: strategy,
      adaptiveRepository: adaptive,
      performanceRiskFacts: riskFacts,
      clock: { now: () => now },
      ids: {
        decisionId: (sourceLessonId, cutoff) => `decision:${sourceLessonId}:${cutoff}`,
        replacementLessonId: (sourceLessonId, cutoff) => `replacement:${sourceLessonId}:${cutoff}`,
        supersessionId: (sourceLessonId) => `supersession:${sourceLessonId}`,
      },
    });

    const adapted = await adaptiveService.evaluateLesson('adaptive-source', STUDENT);
    expect(adapted.decision).toMatchObject({
      action: 'SUPERSEDE',
      selectedIntent: 'CORRECTION',
      targetMistakeId: recurrentMistake!.mistake.id,
    });
    expect(adapted.decision.rationaleCodes).toEqual(expect.arrayContaining(['BLOCKING_MISTAKE', 'RECURRENT_MISTAKE']));

    const parentView = await new ParentProgressService({
      learning,
      planning,
      practice,
      mistakes,
      strategy,
      adaptive,
      riskFacts,
    }).getView(STUDENT, now);
    const objective = parentView.topics.flatMap((topic) => topic.objectives)
      .find((entry) => entry.objectiveId === OBJECTIVE);
    expect(objective).toMatchObject({ coverage: 'PRACTISED', mastery: 'DEVELOPING', performance: 'STRUGGLING' });
    expect(parentView.strategies.find((entry) => entry.strategyId === 'STRAT-DRAW-DIAGRAM'))
      .toMatchObject({ state: 'DEVELOPING', independentUseCount: 1 });
    expect(parentView.summary.recurrentMistakes).toBe(1);
    expect(parentView.nextLesson).toMatchObject({
      lessonId: adapted.effectiveLesson.lesson.id,
      intent: 'CORRECTION',
      adapted: true,
      originalLessonId: 'adaptive-source',
      targetMistakeId: recurrentMistake!.mistake.id,
    });

    await resolveMistake(correction, recurrentMistake!.mistake.id, 'recurrence', 18);
    await planning.appendExecutionEvent({ id: 'replacement-start', lessonId: adapted.effectiveLesson.lesson.id, studentId: STUDENT, type: 'STARTED', occurredAt: at(23) });
    await planning.appendExecutionEvent({ id: 'replacement-done', lessonId: adapted.effectiveLesson.lesson.id, studentId: STUDENT, type: 'COMPLETED', occurredAt: at(24), actualMinutes: 20 });

    now = at(25);
    const forward = await adaptiveService.evaluateNextPlannedLesson(STUDENT);
    expect(forward).not.toBeNull();
    expect(forward!.effectiveLesson.lesson.id).toBe('forward-learn');
    expect(forward!.decision).toMatchObject({ action: 'KEEP', selectedIntent: 'LEARN' });
    expect(await correction.listOpenMistakes(STUDENT)).toHaveLength(0);
  });
});
