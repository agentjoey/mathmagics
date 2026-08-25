import { describe, expect, test } from 'vitest';
import {
  CorrectionServiceImpl,
  MemoryMistakeRepository,
  type AttemptProblemResolver,
  type TrustedAttemptProblem,
} from '@/lib/correction';
import { MemoryLearningStateRepository } from '@/lib/learning';
import {
  MemoryPracticeRepository,
  type AnswerSpec,
  type Attempt,
  type PracticeItem,
  type PracticeProblemSpec,
  type PracticeSession,
} from '@/lib/practice';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
  MistakeDiagnosisContext,
  TrustedCorrectionContext,
} from '@/lib/providers/correction';

const t0 = '2026-08-25T13:00:00.000Z';
const t1 = '2026-08-25T13:01:00.000Z';
const t2 = '2026-08-25T13:02:00.000Z';
const t3 = '2026-08-25T13:03:00.000Z';
const t4 = '2026-08-25T13:04:00.000Z';
const t5 = '2026-08-25T13:05:00.000Z';
const t6 = '2026-08-25T13:06:00.000Z';
const t7 = '2026-08-25T13:07:00.000Z';
const t8 = '2026-08-25T13:08:00.000Z';

class Resolver implements AttemptProblemResolver {
  readonly byAttempt = new Map<string, TrustedAttemptProblem>();

  async resolve(attempt: Attempt): Promise<TrustedAttemptProblem> {
    const value = this.byAttempt.get(attempt.id);
    if (!value) throw new Error(`missing trusted problem: ${attempt.id}`);
    return { ...structuredClone(value), attempt: structuredClone(attempt) };
  }
}

class Provider implements CorrectionAIProvider {
  candidate: DiagnosisCandidate = {
    target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
    rationale: 'candidate from allowed taxonomy',
  };

  async proposeDiagnosis(_context: MistakeDiagnosisContext): Promise<DiagnosisCandidate> {
    return structuredClone(this.candidate);
  }

  async prepareGuidance(_context: TrustedCorrectionContext): Promise<CorrectionGuidance> {
    return { diagnosisExplanation: 'Use the same whole.', socraticPrompts: ['Which equal part is smaller?'] };
  }
}

function setup() {
  const mistakeRepository = new MemoryMistakeRepository();
  const practiceRepository = new MemoryPracticeRepository();
  const learningRepository = new MemoryLearningStateRepository();
  // Memory saveStudent has no async suspension point, so this seeds synchronously before
  // the repository is used while keeping setup itself convenient for every edge fixture.
  void learningRepository.saveStudent({
    id: 'student-1',
    displayName: 'Test Student',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 5,
    minutesPerSession: 30,
    createdAt: t0,
    updatedAt: t0,
  });
  const resolver = new Resolver();
  const provider = new Provider();
  const service = new CorrectionServiceImpl(
    mistakeRepository,
    practiceRepository,
    learningRepository,
    resolver,
    provider,
  );
  return { service, mistakeRepository, practiceRepository, learningRepository, resolver, provider };
}

async function seedRoot(
  practiceRepository: MemoryPracticeRepository,
  resolver: Resolver,
  options: {
    id: string;
    answerText: string;
    problemSpec?: PracticeProblemSpec;
    answerSpec?: AnswerSpec;
    submittedAt?: string;
  },
): Promise<Attempt> {
  const objectiveId = 'P3-FRA-003';
  const session: PracticeSession = {
    id: `session-${options.id}`,
    studentId: 'student-1',
    lessonId: `lesson-${options.id}`,
    objectiveId,
    policyVersion: 'practice-v1',
    createdAt: options.submittedAt ?? t0,
  };
  const problemSpec = options.problemSpec ?? {
    kind: 'FRACTION_COMPARE' as const,
    leftNumerator: 1,
    leftDenominator: 8,
    rightNumerator: 1,
    rightDenominator: 4,
  };
  const answerSpec = options.answerSpec ?? {
    kind: 'EXACT_TEXT' as const,
    acceptedValues: ['<'],
    caseSensitive: false as const,
  };
  const item: PracticeItem = {
    id: `item-${options.id}`,
    sessionId: session.id,
    studentId: session.studentId,
    objectiveId,
    sequence: 1,
    difficultyBand: 'CORE',
    problemSpec,
    prompt: 'Compare the fractions.',
    answerSpec,
    hint: 'Use the same whole.',
    solutionOutline: ['Compare equal parts.'],
    generator: 'edge-fixture',
    generatorVersion: '1',
    createdAt: session.createdAt,
  };
  await practiceRepository.createPracticeSession(session, [item]);
  const attempt: Attempt = {
    id: options.id,
    source: { kind: 'PRACTICE', sessionId: session.id, itemId: item.id },
    studentId: session.studentId,
    objectiveId,
    answerText: options.answerText,
    outcome: 'INCORRECT',
    hintUsed: false,
    gradingPolicyVersion: 'grading-v1',
    submittedAt: options.submittedAt ?? t0,
    recordedAt: options.submittedAt ?? t0,
  };
  await practiceRepository.appendAttempt(attempt);
  resolver.byAttempt.set(attempt.id, {
    attempt,
    problemSpec,
    answerSpec,
    prompt: item.prompt,
    hint: item.hint,
    solutionOutline: item.solutionOutline,
    classification: item.difficultyBand,
  });
  return attempt;
}

function correctAnswer(item: { answerSpec: AnswerSpec }): string {
  const answer = item.answerSpec;
  if (answer.kind === 'EXACT_TEXT') return answer.acceptedValues[0]!;
  if (answer.kind === 'INTEGER' || answer.kind === 'DECIMAL') return answer.value;
  if (answer.kind === 'CHOICE') return answer.optionId;
  return `${answer.numerator}/${answer.denominator}`;
}

async function advanceToTransfer(
  service: CorrectionServiceImpl,
  practiceRepository: MemoryPracticeRepository,
  resolver: Resolver,
  rootId: string,
) {
  const root = await seedRoot(practiceRepository, resolver, { id: rootId, answerText: '>' });
  const mistake = await service.observeIncorrectAttempt({ attemptId: root.id }, t0);
  const start = await service.startCorrection(mistake.id, t1);
  await service.submitCorrectionRetry({
    mistakeId: mistake.id,
    correctionItemId: start.item.id,
    attemptId: `${rootId}-retry`,
    answerText: '<',
  }, t2);
  const reasoningSpec = start.reasoningChecks[0]!;
  await service.submitReasoningCheck({
    mistakeId: mistake.id,
    checkId: reasoningSpec.id,
    submissionId: `${rootId}-reasoning`,
    response: { optionId: 'SMALLER' },
  }, t3);
  const transfer = await service.prepareTransfer(mistake.id, t4);
  return { mistake, transfer, reasoningSpec };
}

describe('CorrectionService edge semantics', () => {
  test('consolidates a provisional episode when human confirmation matches an existing open target', async () => {
    const { service, mistakeRepository, practiceRepository, resolver, provider } = setup();
    const deterministic = await seedRoot(practiceRepository, resolver, { id: 'root-deterministic', answerText: '>' });
    const canonical = await service.observeIncorrectAttempt({ attemptId: deterministic.id }, t0);

    const uncertain = await seedRoot(practiceRepository, resolver, {
      id: 'root-uncertain',
      answerText: '=',
      submittedAt: t1,
    });
    const provisional = await service.observeIncorrectAttempt({ attemptId: uncertain.id }, t1);
    expect(provisional.id).not.toBe(canonical.id);
    expect((await service.getMistake(provisional.id)).state).toBe('OBSERVED');

    const candidate = await service.proposeDiagnosis(provisional.id, t2);
    expect(candidate.target).toEqual(provider.candidate.target);
    const confirmed = await service.confirmDiagnosis({
      mistakeId: provisional.id,
      target: candidate.target,
      confirmerRole: 'PARENT',
    }, t3);

    expect(confirmed.mistake.id).toBe(canonical.id);
    expect((await mistakeRepository.listAttemptLinks(canonical.id)).map((link) => link.attemptId)).toContain(uncertain.id);
    const aliasEvents = await mistakeRepository.listEvents(provisional.id);
    expect(aliasEvents.some((event) =>
      event.type === 'MISTAKE_CONSOLIDATED' && event.payload.canonicalMistakeId === canonical.id)).toBe(true);
  });

  test('creates a new episode when the same diagnosis recurs after the previous episode is resolved', async () => {
    const { service, practiceRepository, resolver } = setup();
    const { mistake, transfer } = await advanceToTransfer(service, practiceRepository, resolver, 'root-old');
    await service.submitTransferAttempt({
      mistakeId: mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'root-old-transfer',
      answerText: correctAnswer(transfer),
    }, t5);
    expect((await service.getMistake(mistake.id)).state).toBe('RESOLVED');

    const recurrenceRoot = await seedRoot(practiceRepository, resolver, {
      id: 'root-recurrence',
      answerText: '>',
      submittedAt: t6,
    });
    const recurrence = await service.observeIncorrectAttempt({ attemptId: recurrenceRoot.id }, t6);
    expect(recurrence.id).not.toBe(mistake.id);
    expect((await service.getMistake(recurrence.id)).state).toBe('CONFIRMED');

    const summary = await service.getMisconceptionSummary('student-1');
    expect(summary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: { kind: 'MISCONCEPTION', misconceptionId: 'MIS-FRA-DENOMINATOR-SIZE' },
        resolvedEpisodeCount: 1,
        activeEpisodeCount: 1,
        recurrenceCount: 1,
      }),
    ]));
  });

  test('consumes a failed transfer round and requires fresh independent reasoning before round 2', async () => {
    const { service, practiceRepository, learningRepository, resolver } = setup();
    const { mistake, transfer, reasoningSpec } = await advanceToTransfer(service, practiceRepository, resolver, 'root-transfer-fail');

    const first = await service.submitTransferAttempt({
      mistakeId: mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'transfer-fail-1',
      answerText: 'definitely wrong',
    }, t5);
    expect(first.outcome).toBe('INCORRECT');

    const guessedCorrect = await service.submitTransferAttempt({
      mistakeId: mistake.id,
      correctionItemId: transfer.id,
      attemptId: 'transfer-guess-2',
      answerText: correctAnswer(transfer),
    }, t6);
    expect(guessedCorrect.outcome).toBe('CORRECT');
    expect((await learningRepository.listEvidenceForObjective('student-1', 'P3-FRA-003'))
      .filter((record) => record.type === 'application_correct')).toHaveLength(0);
    expect((await service.getMistake(mistake.id)).state).toBe('CORRECTING');
    await expect(service.prepareTransfer(mistake.id, t6)).rejects.toThrow(/additional independent reasoning/i);

    await service.submitReasoningCheck({
      mistakeId: mistake.id,
      checkId: reasoningSpec.id,
      submissionId: 'reasoning-after-transfer-fail',
      response: { optionId: 'SMALLER' },
    }, t7);
    const secondRound = await service.prepareTransfer(mistake.id, t7);
    expect(secondRound.transferRound).toBe(2);
    expect(secondRound.problemSpec).not.toEqual(transfer.problemSpec);

    await service.submitTransferAttempt({
      mistakeId: mistake.id,
      correctionItemId: secondRound.id,
      attemptId: 'transfer-round-2-correct',
      answerText: correctAnswer(secondRound),
    }, t8);
    expect((await service.getMistake(mistake.id)).state).toBe('RESOLVED');
  });
});
