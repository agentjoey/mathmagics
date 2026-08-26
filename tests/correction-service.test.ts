import { describe, expect, test } from 'vitest';
import {
  CorrectionServiceImpl,
  MemoryMistakeRepository,
  type AttemptProblemResolver,
  type TrustedAttemptProblem,
} from '@/lib/correction';
import type { CurrentPositionAssumption, EvidenceRecord, LearningStateRepository, StudentProfile } from '@/lib/learning';
import type {
  Attempt,
  PracticeHintReveal,
  PracticeItem,
  PracticeRepository,
  PracticeSession,
} from '@/lib/practice';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
  MistakeDiagnosisContext,
  TrustedCorrectionContext,
} from '@/lib/providers/correction';

const t0 = '2026-08-25T12:00:00.000Z';
const t1 = '2026-08-25T12:01:00.000Z';
const t2 = '2026-08-25T12:02:00.000Z';
const t3 = '2026-08-25T12:03:00.000Z';
const t4 = '2026-08-25T12:04:00.000Z';
const t5 = '2026-08-25T12:05:00.000Z';

class TestPracticeRepository implements PracticeRepository {
  readonly attempts = new Map<string, Attempt>();
  async createPracticeSession(_session: PracticeSession, _items: PracticeItem[]): Promise<void> {}
  async getPracticeSession(_sessionId: string): Promise<PracticeSession | undefined> { return undefined; }
  async findPracticeSession(_lessonId: string, _objectiveId: string): Promise<PracticeSession | undefined> { return undefined; }
  async getPracticeItem(_itemId: string): Promise<PracticeItem | undefined> { return undefined; }
  async listPracticeItems(_sessionId: string): Promise<PracticeItem[]> { return []; }
  async appendHintReveal(_reveal: PracticeHintReveal): Promise<void> {}
  async listHintReveals(_itemId: string): Promise<PracticeHintReveal[]> { return []; }
  async getAttempt(attemptId: string): Promise<Attempt | undefined> {
    const value = this.attempts.get(attemptId);
    return value ? structuredClone(value) : undefined;
  }
  async appendAttempt(attempt: Attempt): Promise<void> {
    if (this.attempts.has(attempt.id)) throw new Error('attempt id already exists');
    this.attempts.set(attempt.id, structuredClone(attempt));
  }
  async listAttemptsForItem(itemId: string): Promise<Attempt[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.source.kind === 'PRACTICE' && attempt.source.itemId === itemId)
      .map((attempt) => structuredClone(attempt));
  }
  async listAttemptsForSession(sessionId: string): Promise<Attempt[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.source.kind === 'PRACTICE' && attempt.source.sessionId === sessionId)
      .map((attempt) => structuredClone(attempt));
  }
  async listAttemptsForCorrectionItem(correctionItemId: string): Promise<Attempt[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.source.kind === 'CORRECTION' && attempt.source.correctionItemId === correctionItemId)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
      .map((attempt) => structuredClone(attempt));
  }
}

class TestLearningRepository implements LearningStateRepository {
  readonly evidence = new Map<string, EvidenceRecord>();
  async getStudent(_studentId: string): Promise<StudentProfile | undefined> { return undefined; }
  async saveStudent(_student: StudentProfile): Promise<void> {}
  async getCurrentPosition(_studentId: string): Promise<CurrentPositionAssumption | undefined> { return undefined; }
  async setCurrentPosition(_position: CurrentPositionAssumption): Promise<void> {}
  async getEvidence(evidenceId: string): Promise<EvidenceRecord | undefined> {
    const value = this.evidence.get(evidenceId);
    return value ? structuredClone(value) : undefined;
  }
  async appendEvidence(record: EvidenceRecord): Promise<void> {
    if (this.evidence.has(record.id)) throw new Error('evidence id already exists');
    this.evidence.set(record.id, structuredClone(record));
  }
  async listEvidenceForStudent(studentId: string): Promise<EvidenceRecord[]> {
    return [...this.evidence.values()]
      .filter((record) => record.studentId === studentId)
      .map((record) => structuredClone(record));
  }
  async listEvidenceForObjective(studentId: string, objectiveId: string): Promise<EvidenceRecord[]> {
    return [...this.evidence.values()]
      .filter((record) => record.studentId === studentId && record.objectiveId === objectiveId)
      .map((record) => structuredClone(record));
  }
}

class TestResolver implements AttemptProblemResolver {
  readonly problems = new Map<string, TrustedAttemptProblem>();
  async resolve(attempt: Attempt): Promise<TrustedAttemptProblem> {
    const problem = this.problems.get(attempt.id);
    if (!problem) throw new Error(`missing trusted problem: ${attempt.id}`);
    return { ...structuredClone(problem), attempt: structuredClone(attempt) };
  }
}

class TestProvider implements CorrectionAIProvider {
  diagnosisCalls = 0;
  guidanceCalls = 0;
  candidate: DiagnosisCandidate = { target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' }, rationale: 'procedure candidate' };
  async proposeDiagnosis(_context: MistakeDiagnosisContext): Promise<DiagnosisCandidate> {
    this.diagnosisCalls += 1;
    return structuredClone(this.candidate);
  }
  async prepareGuidance(_context: TrustedCorrectionContext): Promise<CorrectionGuidance> {
    this.guidanceCalls += 1;
    return { diagnosisExplanation: 'Think about the size of each equal part.', socraticPrompts: ['Which part is larger?'] };
  }
}

function rootAttempt(id = 'root-1'): Attempt {
  return {
    id,
    source: { kind: 'PRACTICE', sessionId: `session-${id}`, itemId: `item-${id}` },
    studentId: 'student-1', objectiveId: 'P3-FRA-003', answerText: '>', outcome: 'INCORRECT', hintUsed: false,
    gradingPolicyVersion: 'grading-v1', submittedAt: t0, recordedAt: t0,
  };
}

function fractionProblem(attempt: Attempt): TrustedAttemptProblem {
  return {
    attempt: structuredClone(attempt),
    problemSpec: { kind: 'FRACTION_COMPARE', leftNumerator: 1, leftDenominator: 8, rightNumerator: 1, rightDenominator: 4 },
    answerSpec: { kind: 'EXACT_TEXT', acceptedValues: ['<'], caseSensitive: false },
    prompt: 'Compare 1/8 and 1/4.', hint: 'Use the same whole.', solutionOutline: ['1/8 < 1/4'], classification: 'CORE',
  };
}

function uncertainAttempt(id = 'uncertain-1'): Attempt {
  return {
    id,
    source: { kind: 'PRACTICE', sessionId: `session-${id}`, itemId: `item-${id}` },
    studentId: 'student-1', objectiveId: 'P3-FRA-005', answerText: '1/9', outcome: 'INCORRECT', hintUsed: false,
    gradingPolicyVersion: 'grading-v1', submittedAt: t0, recordedAt: t0,
  };
}

function uncertainProblem(attempt: Attempt): TrustedAttemptProblem {
  return {
    attempt: structuredClone(attempt),
    problemSpec: { kind: 'FRACTION_OPERATION', operation: 'ADD', leftNumerator: 1, leftDenominator: 4, rightNumerator: 1, rightDenominator: 2 },
    answerSpec: { kind: 'FRACTION', numerator: 3, denominator: 4, equivalence: 'VALUE' },
    prompt: '1/4 + 1/2 = ?', solutionOutline: ['1/4 + 2/4 = 3/4'], classification: 'CORE',
  };
}

function setup() {
  const mistakeRepository = new MemoryMistakeRepository();
  const practiceRepository = new TestPracticeRepository();
  const learningRepository = new TestLearningRepository();
  const resolver = new TestResolver();
  const provider = new TestProvider();
  const service = new CorrectionServiceImpl(
    mistakeRepository,
    practiceRepository,
    learningRepository,
    resolver,
    provider,
  );
  return { service, mistakeRepository, practiceRepository, learningRepository, resolver, provider };
}

function answerFor(item: { answerSpec: TrustedAttemptProblem['answerSpec'] }): string {
  const spec = item.answerSpec;
  if (spec.kind === 'EXACT_TEXT') return spec.acceptedValues[0]!;
  if (spec.kind === 'INTEGER' || spec.kind === 'DECIMAL') return spec.value;
  if (spec.kind === 'CHOICE') return spec.optionId;
  return `${spec.numerator}/${spec.denominator}`;
}

describe('CorrectionServiceImpl', () => {
  test('observes deterministic mistakes idempotently and aggregates later related errors into the open episode', async () => {
    const { service, mistakeRepository, practiceRepository, resolver } = setup();
    const first = rootAttempt('root-1');
    practiceRepository.attempts.set(first.id, first);
    resolver.problems.set(first.id, fractionProblem(first));

    const mistake = await service.observeIncorrectAttempt({ attemptId: first.id }, t0);
    expect((await service.getMistake(mistake.id)).state).toBe('CONFIRMED');
    expect((await mistakeRepository.listEvents(mistake.id)).map((event) => event.type).sort()).toEqual([
      'ATTEMPT_LINKED', 'DIAGNOSIS_CONFIRMED', 'MISTAKE_OBSERVED',
    ].sort());

    expect((await service.observeIncorrectAttempt({ attemptId: first.id }, t1)).id).toBe(mistake.id);
    expect(await mistakeRepository.listAttemptLinks(mistake.id)).toHaveLength(1);

    const second = rootAttempt('root-2');
    second.submittedAt = t1;
    second.recordedAt = t1;
    practiceRepository.attempts.set(second.id, second);
    resolver.problems.set(second.id, fractionProblem(second));
    expect((await service.observeIncorrectAttempt({ attemptId: second.id }, t1)).id).toBe(mistake.id);
    expect(await mistakeRepository.listAttemptLinks(mistake.id)).toHaveLength(2);
  });

  test('keeps uncertain AI diagnosis OBSERVED until human confirmation', async () => {
    const { service, practiceRepository, resolver, provider } = setup();
    const attempt = uncertainAttempt();
    practiceRepository.attempts.set(attempt.id, attempt);
    resolver.problems.set(attempt.id, uncertainProblem(attempt));

    const mistake = await service.observeIncorrectAttempt({ attemptId: attempt.id }, t0);
    expect((await service.getMistake(mistake.id)).state).toBe('OBSERVED');
    const candidate = await service.proposeDiagnosis(mistake.id, t1);
    expect(candidate).toEqual(provider.candidate);
    expect(provider.diagnosisCalls).toBe(1);
    expect((await service.getMistake(mistake.id)).state).toBe('OBSERVED');

    const confirmed = await service.confirmDiagnosis({
      mistakeId: mistake.id, target: provider.candidate.target, confirmerRole: 'PARENT',
    }, t2);
    expect(confirmed.state).toBe('CONFIRMED');
    expect(confirmed.confirmedTarget).toEqual(provider.candidate.target);
  });

  test('runs retry, reasoning, transfer and deterministic resolution with replay repair', async () => {
    const { service, practiceRepository, learningRepository, resolver } = setup();
    const root = rootAttempt();
    practiceRepository.attempts.set(root.id, root);
    resolver.problems.set(root.id, fractionProblem(root));
    const mistake = await service.observeIncorrectAttempt({ attemptId: root.id }, t0);

    const start = await service.startCorrection(mistake.id, t1);
    expect(start.item.kind).toBe('ORIGINAL_RETRY');
    expect(start.reasoningChecks).toHaveLength(1);
    expect(start.guidance?.socraticPrompts).toHaveLength(1);

    const wrong = await service.submitCorrectionRetry({
      mistakeId: mistake.id, correctionItemId: start.item.id, attemptId: 'retry-1', answerText: '>',
    }, t2);
    expect(wrong.outcome).toBe('INCORRECT');
    expect([...learningRepository.evidence.values()].some((record) => record.type === 'incorrect')).toBe(false);

    const correctInput = {
      mistakeId: mistake.id, correctionItemId: start.item.id, attemptId: 'retry-2', answerText: '<',
    };
    const correct = await service.submitCorrectionRetry(correctInput, t3);
    expect(correct.outcome).toBe('CORRECT');
    const corrected = [...learningRepository.evidence.values()].find((record) => record.type === 'corrected');
    expect(corrected?.origin.refId).toBe(correct.id);

    learningRepository.evidence.delete(corrected!.id);
    expect((await service.submitCorrectionRetry(correctInput, t4)).id).toBe(correct.id);
    expect(await learningRepository.getEvidence(corrected!.id)).toBeDefined();

    await expect(service.prepareTransfer(mistake.id, t4)).rejects.toThrow(/reasoning|explained/i);
    const spec = start.reasoningChecks[0]!;
    await service.revealReasoningHelp(mistake.id, spec.id, t4);
    const assisted = await service.submitReasoningCheck({
      mistakeId: mistake.id, checkId: spec.id, submissionId: 'reasoning-assisted',
      response: { optionId: 'SMALLER' },
    }, t4);
    expect(assisted).toMatchObject({ outcome: 'PASS', assisted: true });
    expect([...learningRepository.evidence.values()].some((record) => record.type === 'explained_independently')).toBe(false);

    const independent = await service.submitReasoningCheck({
      mistakeId: mistake.id, checkId: spec.id, submissionId: 'reasoning-independent',
      response: { optionId: 'SMALLER' },
    }, t5);
    expect(independent).toMatchObject({ outcome: 'PASS', assisted: false });
    expect([...learningRepository.evidence.values()].filter((record) => record.type === 'explained_independently')).toHaveLength(1);

    const transfer = await service.prepareTransfer(mistake.id, t5);
    expect(transfer).toMatchObject({ kind: 'TRANSFER', transferRound: 1 });
    expect((await service.prepareTransfer(mistake.id, t5)).id).toBe(transfer.id);

    const transferAttempt = await service.submitTransferAttempt({
      mistakeId: mistake.id, correctionItemId: transfer.id, attemptId: 'transfer-attempt-1', answerText: answerFor(transfer),
    }, t5);
    expect(transferAttempt.outcome).toBe('CORRECT');
    expect((await service.getMistake(mistake.id)).state).toBe('RESOLVED');
    expect([...learningRepository.evidence.values()].filter((record) => record.type === 'application_correct')).toHaveLength(1);
  });

  test('rejects missing, correct, and CORRECTION attempts as root observations', async () => {
    const { service, practiceRepository, resolver } = setup();
    await expect(service.observeIncorrectAttempt({ attemptId: 'missing' }, t0)).rejects.toThrow(/Unknown attempt/i);

    const correct = { ...rootAttempt('correct-root'), outcome: 'CORRECT' as const };
    practiceRepository.attempts.set(correct.id, correct);
    resolver.problems.set(correct.id, fractionProblem(correct));
    await expect(service.observeIncorrectAttempt({ attemptId: correct.id }, t0)).rejects.toThrow(/incorrect/i);

    const correction = {
      ...rootAttempt('correction-root'),
      source: { kind: 'CORRECTION' as const, mistakeId: 'm', correctionItemId: 'c' },
    };
    practiceRepository.attempts.set(correction.id, correction);
    await expect(service.observeIncorrectAttempt({ attemptId: correction.id }, t0)).rejects.toThrow(/root|CORRECTION/i);
  });
});
