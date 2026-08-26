import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  CorrectionAttemptObserver,
  CorrectionServiceImpl,
  MemoryMistakeRepository,
  RepositoryAttemptProblemResolver,
  type CorrectionItem,
  type MistakeEvent,
  type MistakeRepository,
  type ReasoningCheckSpec,
} from '@/lib/correction';
import { HomeworkServiceImpl, MemoryHomeworkRepository } from '@/lib/homework';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository } from '@/lib/planning';
import {
  MemoryPracticeRepository,
  PracticeServiceImpl,
  type AnswerSpec,
  type PracticeIdFactory,
  type PracticeItem,
  type PracticeSession,
} from '@/lib/practice';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
  MistakeDiagnosisContext,
  TrustedCorrectionContext,
} from '@/lib/providers/correction';
import type { HomeworkVisionInput, HomeworkVisionProvider } from '@/lib/providers/homework-vision';

const T0 = '2026-08-26T00:00:00.000Z';
const T1 = '2026-08-26T00:01:00.000Z';
const T2 = '2026-08-26T00:02:00.000Z';
const T3 = '2026-08-26T00:03:00.000Z';
const T4 = '2026-08-26T00:04:00.000Z';
const T5 = '2026-08-26T00:05:00.000Z';
const T6 = '2026-08-26T00:06:00.000Z';
const T7 = '2026-08-26T00:07:00.000Z';
const T8 = '2026-08-26T00:08:00.000Z';
const T9 = '2026-08-26T00:09:00.000Z';

const idFactory: PracticeIdFactory = {
  sessionId: (lessonId, objectiveId) => `generated:${lessonId}:${objectiveId}`,
  itemId: (sessionId, sequence) => `${sessionId}:${sequence}`,
};

class DeterministicCorrectionProvider implements CorrectionAIProvider {
  candidate: DiagnosisCandidate = {
    target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
    rationale: 'The response is consistent with a procedure error candidate.',
  };

  async proposeDiagnosis(_context: MistakeDiagnosisContext): Promise<DiagnosisCandidate> {
    return structuredClone(this.candidate);
  }

  async prepareGuidance(_context: TrustedCorrectionContext): Promise<CorrectionGuidance> {
    return {
      diagnosisExplanation: 'Compare the meaning of the quantities before calculating.',
      socraticPrompts: ['What does each number represent?'],
    };
  }
}

class FailOnceResolvedEventRepository extends MemoryMistakeRepository {
  private shouldFail = true;

  override async appendEvent(event: MistakeEvent): Promise<void> {
    if (event.type === 'MISTAKE_RESOLVED' && this.shouldFail) {
      this.shouldFail = false;
      throw new Error('simulated interrupted resolution receipt');
    }
    await super.appendEvent(event);
  }
}

function field(value: string, confidence = 0.99) {
  return { value, confidence, region: { x: 0, y: 0, width: 0.2, height: 0.1 } };
}

function fractionHomeworkVision(answer = '>'): HomeworkVisionProvider {
  return {
    async extract(input: HomeworkVisionInput) {
      return {
        submissionId: input.submissionId,
        studentId: input.studentId,
        provider: 'fixture',
        model: 'fixture-v1',
        schemaVersion: 'homework-vision-v1' as const,
        problems: [{
          id: `${input.submissionId}:problem:1`,
          submissionId: input.submissionId,
          studentId: input.studentId,
          sequence: 1,
          question: field('1/8 ? 1/4'),
          answer: field(answer),
          structured: {
            family: 'FRACTION_COMPARE',
            fields: {
              leftNumerator: field('1'),
              leftDenominator: field('8'),
              rightNumerator: field('1'),
              rightDenominator: field('4'),
            },
          },
          provider: 'fixture',
          model: 'fixture-v1',
          schemaVersion: 'homework-vision-v1' as const,
          createdAt: input.now,
        }],
      };
    },
  };
}

async function harness(
  mistakeRepository: MistakeRepository = new MemoryMistakeRepository(),
  visionProvider: HomeworkVisionProvider = fractionHomeworkVision(),
) {
  const learning = new MemoryLearningStateRepository();
  await learning.saveStudent({
    id: 'student-1',
    displayName: 'Learner',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
    createdAt: T0,
    updatedAt: T0,
  });
  const practice = new MemoryPracticeRepository();
  const homework = new MemoryHomeworkRepository();
  const planning = new MemoryPlanningRepository();
  const resolver = new RepositoryAttemptProblemResolver(practice, homework, learning);
  const provider = new DeterministicCorrectionProvider();
  const correction = new CorrectionServiceImpl(
    mistakeRepository,
    practice,
    learning,
    resolver,
    provider,
  );
  const observer = new CorrectionAttemptObserver(correction);
  const practiceService = new PracticeServiceImpl(learning, planning, practice, idFactory, observer);
  const homeworkService = new HomeworkServiceImpl(homework, practice, learning, visionProvider, observer);
  return {
    learning,
    practice,
    homework,
    correction,
    practiceService,
    homeworkService,
    provider,
    mistakeRepository,
  };
}

function fractionSession(stem: string, createdAt: string, objectiveId = 'P3-FRA-003'): PracticeSession {
  return {
    id: `${stem}:session`,
    studentId: 'student-1',
    lessonId: `${stem}:lesson`,
    objectiveId,
    policyVersion: 'practice-v1',
    createdAt,
  };
}

function fractionCompareItem(session: PracticeSession, stem: string): PracticeItem {
  return {
    id: `${stem}:item`,
    sessionId: session.id,
    studentId: session.studentId,
    objectiveId: session.objectiveId,
    sequence: 1,
    difficultyBand: 'CORE',
    problemSpec: {
      kind: 'FRACTION_COMPARE',
      leftNumerator: 1,
      leftDenominator: 8,
      rightNumerator: 1,
      rightDenominator: 4,
    },
    answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
    prompt: 'Fill in <, >, or = : 1/8 ? 1/4',
    hint: 'Think about equal parts of the same whole.',
    solutionOutline: ['A larger denominator means smaller unit fractions for the same whole.'],
    generator: 'e2e-fixture',
    generatorVersion: 'e2e-fixture-v1',
    createdAt: session.createdAt,
  };
}

function fractionOperationItem(session: PracticeSession, stem: string): PracticeItem {
  return {
    id: `${stem}:item`,
    sessionId: session.id,
    studentId: session.studentId,
    objectiveId: session.objectiveId,
    sequence: 1,
    difficultyBand: 'CORE',
    problemSpec: {
      kind: 'FRACTION_OPERATION',
      operation: 'ADD',
      leftNumerator: 1,
      leftDenominator: 4,
      rightNumerator: 1,
      rightDenominator: 2,
    },
    answerSpec: { kind: 'FRACTION', numerator: 3, denominator: 4, equivalence: 'VALUE' },
    prompt: 'What is 1/4 + 1/2?',
    hint: 'Use equivalent fractions.',
    solutionOutline: ['1/4 + 2/4 = 3/4'],
    generator: 'e2e-fixture',
    generatorVersion: 'e2e-fixture-v1',
    createdAt: session.createdAt,
  };
}

async function seedPracticeItem(
  practice: MemoryPracticeRepository,
  stem: string,
  createdAt: string,
  objectiveId = 'P3-FRA-003',
  kind: 'COMPARE' | 'OPERATION' = 'COMPARE',
): Promise<{ session: PracticeSession; item: PracticeItem }> {
  const session = fractionSession(stem, createdAt, objectiveId);
  const item = kind === 'COMPARE'
    ? fractionCompareItem(session, stem)
    : fractionOperationItem(session, stem);
  await practice.createPracticeSession(session, [item]);
  return { session, item };
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
  if (spec.kind === 'CHOICE') return { optionId: spec.expectedOptionId };
  return structuredClone(spec.expected);
}

async function completeCorrectionToTransfer(
  correction: CorrectionServiceImpl,
  mistakeId: string,
  retryAttemptId: string,
  reasoningStem: string,
  startAt = T2,
): Promise<{ transfer: CorrectionItem; reasoningChecks: ReasoningCheckSpec[] }> {
  const start = await correction.startCorrection(mistakeId, startAt);
  await correction.submitCorrectionRetry({
    mistakeId,
    correctionItemId: start.item.id,
    attemptId: retryAttemptId,
    answerText: answerText(start.item.answerSpec),
  }, T3);
  for (const [index, spec] of start.reasoningChecks.entries()) {
    await correction.submitReasoningCheck({
      mistakeId,
      checkId: spec.id,
      submissionId: `${reasoningStem}:${index + 1}`,
      response: reasoningResponse(spec),
    }, T4);
  }
  const transfer = await correction.prepareTransfer(mistakeId, T5);
  return { transfer, reasoningChecks: start.reasoningChecks };
}

async function submitWrongPractice(
  h: Awaited<ReturnType<typeof harness>>,
  stem: string,
  at: string,
): Promise<string> {
  const { session, item } = await seedPracticeItem(h.practice, stem, at);
  const attemptId = `${stem}:wrong`;
  await h.practiceService.submitAttempt({
    attemptId,
    sessionId: session.id,
    itemId: item.id,
    answerText: '>',
  }, at);
  return attemptId;
}

describe('Phase 6 correction + Mistake Book end-to-end', () => {
  test('automatic Practice observation aggregates, corrects, resolves, then creates a recurrence episode', async () => {
    const h = await harness();
    const firstAttemptId = await submitWrongPractice(h, 'practice-a', T1);
    const [firstMistake] = await h.correction.listOpenMistakes('student-1');
    expect(firstMistake).toMatchObject({
      state: 'CONFIRMED',
      confirmedTarget: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
    });
    expect(firstMistake?.mistake.initialAttemptId).toBe(firstAttemptId);

    await submitWrongPractice(h, 'practice-b', T2);
    const aggregated = await h.correction.listOpenMistakes('student-1');
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.links.filter((link) => link.role === 'OBSERVATION')).toHaveLength(2);

    const start = await h.correction.startCorrection(firstMistake!.mistake.id, T3);
    const wrongRetry = await h.correction.submitCorrectionRetry({
      mistakeId: firstMistake!.mistake.id,
      correctionItemId: start.item.id,
      attemptId: 'correction:wrong-retry',
      answerText: '>',
    }, T4);
    expect(wrongRetry.outcome).toBe('INCORRECT');
    expect((await h.learning.listEvidenceForObjective('student-1', 'P3-FRA-003'))
      .filter((record) => record.origin.kind === 'CORRECTION' && record.type === 'incorrect')).toHaveLength(0);

    await h.correction.submitCorrectionRetry({
      mistakeId: firstMistake!.mistake.id,
      correctionItemId: start.item.id,
      attemptId: 'correction:correct-retry',
      answerText: '<',
    }, T5);
    const check = start.reasoningChecks[0]!;
    await h.correction.revealReasoningHelp(firstMistake!.mistake.id, check.id, T5);
    const assisted = await h.correction.submitReasoningCheck({
      mistakeId: firstMistake!.mistake.id,
      checkId: check.id,
      submissionId: 'reasoning:assisted',
      response: reasoningResponse(check),
    }, T6);
    expect(assisted).toMatchObject({ outcome: 'PASS', assisted: true });
    expect((await h.learning.listEvidenceForObjective('student-1', 'P3-FRA-003'))
      .some((record) => record.type === 'explained_independently')).toBe(false);

    await h.correction.submitReasoningCheck({
      mistakeId: firstMistake!.mistake.id,
      checkId: check.id,
      submissionId: 'reasoning:fresh',
      response: reasoningResponse(check),
    }, T7);
    const transfer = await h.correction.prepareTransfer(firstMistake!.mistake.id, T7);
    await h.correction.submitTransferAttempt({
      mistakeId: firstMistake!.mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'transfer:success',
      answerText: answerText(transfer.answerSpec),
    }, T8);
    expect((await h.correction.getMistake(firstMistake!.mistake.id)).state).toBe('RESOLVED');

    const recurrenceAttemptId = await submitWrongPractice(h, 'practice-c', T9);
    await h.practiceService.submitAttempt({
      attemptId: recurrenceAttemptId,
      sessionId: 'practice-c:session',
      itemId: 'practice-c:item',
      answerText: '>',
    }, T9);
    const openAfterRecurrence = await h.correction.listOpenMistakes('student-1');
    expect(openAfterRecurrence).toHaveLength(1);
    expect(openAfterRecurrence[0]?.mistake.id).not.toBe(firstMistake!.mistake.id);
    const summary = await h.correction.getMisconceptionSummary('student-1');
    expect(summary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
        activeEpisodeCount: 1,
        resolvedEpisodeCount: 1,
        recurrenceCount: 1,
      }),
    ]));
  });

  test('incorrect Homework is automatically observed through trusted reconstruction and resolves through the same correction loop', async () => {
    const h = await harness();
    const bytes = new Uint8Array([11, 22, 33]);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await h.homeworkService.submitHomework({
      submissionId: 'homework-1',
      studentId: 'student-1',
      bytes,
      mimeType: 'image/png',
      sha256,
    }, T1);
    const graded = await h.homeworkService.gradeHomeworkProblem({
      problemId: 'homework-1:problem:1',
      attemptId: 'homework:wrong',
    }, T2);
    expect(graded.attempt).toMatchObject({
      outcome: 'INCORRECT',
      source: { kind: 'HOMEWORK', submissionId: 'homework-1', problemId: 'homework-1:problem:1' },
      objectiveId: 'P3-FRA-003',
    });

    const [mistake] = await h.correction.listOpenMistakes('student-1');
    expect(mistake).toMatchObject({
      state: 'CONFIRMED',
      confirmedTarget: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
    });
    const { transfer } = await completeCorrectionToTransfer(
      h.correction,
      mistake!.mistake.id,
      'homework:retry',
      'homework:reasoning',
      T3,
    );
    await h.correction.submitTransferAttempt({
      mistakeId: mistake!.mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'homework:transfer',
      answerText: answerText(transfer.answerSpec),
    }, T6);
    expect((await h.correction.getMistake(mistake!.mistake.id)).state).toBe('RESOLVED');
  });

  test('uncertain diagnosis stays OBSERVED after constrained AI proposal until Student/Parent confirmation', async () => {
    const h = await harness();
    const { session, item } = await seedPracticeItem(h.practice, 'uncertain', T1, 'P3-FRA-005', 'OPERATION');
    await h.practiceService.submitAttempt({
      attemptId: 'uncertain:wrong',
      sessionId: session.id,
      itemId: item.id,
      answerText: '1/9',
    }, T2);
    const [mistake] = await h.correction.listOpenMistakes('student-1');
    expect(mistake?.state).toBe('OBSERVED');
    const candidate = await h.correction.proposeDiagnosis(mistake!.mistake.id, T3);
    expect(candidate).toEqual(h.provider.candidate);
    expect((await h.correction.getMistake(mistake!.mistake.id)).state).toBe('OBSERVED');
    const confirmed = await h.correction.confirmDiagnosis({
      mistakeId: mistake!.mistake.id,
      target: candidate.target,
      confirmerRole: 'PARENT',
    }, T4);
    expect(confirmed).toMatchObject({ state: 'CONFIRMED', confirmedTarget: candidate.target });
  });

  test('failed transfer consumes round 1; a later correct answer on the same item cannot qualify, but fresh reasoning unlocks round 2', async () => {
    const h = await harness();
    await submitWrongPractice(h, 'rounds', T1);
    const [mistake] = await h.correction.listOpenMistakes('student-1');
    const { transfer, reasoningChecks } = await completeCorrectionToTransfer(
      h.correction,
      mistake!.mistake.id,
      'rounds:retry',
      'rounds:reasoning:initial',
    );
    const first = await h.correction.submitTransferAttempt({
      mistakeId: mistake!.mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'rounds:transfer:wrong',
      answerText: '__wrong__',
    }, T6);
    expect(first.outcome).toBe('INCORRECT');
    const second = await h.correction.submitTransferAttempt({
      mistakeId: mistake!.mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'rounds:transfer:late-correct',
      answerText: answerText(transfer.answerSpec),
    }, T7);
    expect(second.outcome).toBe('CORRECT');
    expect((await h.learning.listEvidenceForObjective('student-1', 'P3-FRA-003'))
      .filter((record) => record.type === 'application_correct' && record.origin.kind === 'CORRECTION')).toHaveLength(0);
    await expect(h.correction.prepareTransfer(mistake!.mistake.id, T7))
      .rejects.toThrow(/additional independent reasoning/i);

    for (const [index, spec] of reasoningChecks.entries()) {
      await h.correction.submitReasoningCheck({
        mistakeId: mistake!.mistake.id,
        checkId: spec.id,
        submissionId: `rounds:reasoning:fresh:${index + 1}`,
        response: reasoningResponse(spec),
      }, T8);
    }
    const round2 = await h.correction.prepareTransfer(mistake!.mistake.id, T8);
    expect(round2.transferRound).toBe(2);
    await h.correction.submitTransferAttempt({
      mistakeId: mistake!.mistake.id,
      correctionItemId: round2.id,
      attemptId: 'rounds:transfer:round2',
      answerText: answerText(round2.answerSpec),
    }, T9);
    expect((await h.correction.getMistake(mistake!.mistake.id)).state).toBe('RESOLVED');
  });

  test('unsupported reasoning fails closed and interrupted resolution receipt is repaired on exact replay', async () => {
    const interruptedRepository = new FailOnceResolvedEventRepository();
    const h = await harness(interruptedRepository);
    await submitWrongPractice(h, 'repair', T1);
    const [mistake] = await h.correction.listOpenMistakes('student-1');
    const { transfer } = await completeCorrectionToTransfer(
      h.correction,
      mistake!.mistake.id,
      'repair:retry',
      'repair:reasoning',
    );
    const input = {
      mistakeId: mistake!.mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'repair:transfer',
      answerText: answerText(transfer.answerSpec),
    };
    await expect(h.correction.submitTransferAttempt(input, T6))
      .rejects.toThrow('simulated interrupted resolution receipt');
    expect((await h.correction.getMistake(mistake!.mistake.id)).state).toBe('RESOLVED');
    expect((await interruptedRepository.listEvents(mistake!.mistake.id))
      .some((event) => event.type === 'MISTAKE_RESOLVED')).toBe(false);
    const replay = await h.correction.submitTransferAttempt(input, T7);
    expect(replay.id).toBe(input.attemptId);
    expect((await interruptedRepository.listEvents(mistake!.mistake.id))
      .filter((event) => event.type === 'MISTAKE_RESOLVED')).toHaveLength(1);

    const unsupported = await harness();
    await unsupported.learning.saveStudent({
      id: 'student-p2',
      displayName: 'P2 Learner',
      levelId: 'P2',
      learningMode: 'STRUCTURED_HOME_LEARNING',
      sessionsPerWeek: 4,
      minutesPerSession: 30,
      createdAt: T0,
      updatedAt: T0,
    });
    const session: PracticeSession = {
      id: 'fact:session',
      studentId: 'student-p2',
      lessonId: 'fact:lesson',
      objectiveId: 'P2-MD-001',
      policyVersion: 'practice-v1',
      createdAt: T1,
    };
    const item: PracticeItem = {
      id: 'fact:item',
      sessionId: session.id,
      studentId: session.studentId,
      objectiveId: session.objectiveId,
      sequence: 1,
      difficultyBand: 'CORE',
      problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
      answerSpec: { kind: 'INTEGER', value: '12' },
      prompt: '3 × 4 = ?',
      hint: 'Recall the multiplication fact.',
      solutionOutline: ['3 × 4 = 12'],
      generator: 'e2e-fixture',
      generatorVersion: 'e2e-fixture-v1',
      createdAt: T1,
    };
    await unsupported.practice.createPracticeSession(session, [item]);
    const p2Observer = new CorrectionAttemptObserver(unsupported.correction);
    const p2PracticeService = new PracticeServiceImpl(
      unsupported.learning,
      new MemoryPlanningRepository(),
      unsupported.practice,
      idFactory,
      p2Observer,
    );
    await p2PracticeService.submitAttempt({
      attemptId: 'fact:wrong',
      sessionId: session.id,
      itemId: item.id,
      answerText: '11',
    }, T2);
    const [factMistake] = await unsupported.correction.listOpenMistakes('student-p2');
    expect(factMistake).toMatchObject({
      state: 'CONFIRMED',
      confirmedTarget: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-MD-FACT-RETRIEVAL' },
    });
    const factStart = await unsupported.correction.startCorrection(factMistake!.mistake.id, T3);
    expect(factStart.reasoningChecks).toHaveLength(0);
    await unsupported.correction.submitCorrectionRetry({
      mistakeId: factMistake!.mistake.id,
      correctionItemId: factStart.item.id,
      attemptId: 'fact:retry',
      answerText: '12',
    }, T4);
    await expect(unsupported.correction.prepareTransfer(factMistake!.mistake.id, T5))
      .rejects.toThrow(/explained reasoning/i);
    expect((await unsupported.correction.getMistake(factMistake!.mistake.id)).state).toBe('CORRECTING');
  });
});
