import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CorrectionAttemptObserver,
  CorrectionServiceImpl,
  MemoryMistakeRepository,
  RepositoryAttemptProblemResolver,
} from '@/lib/correction';
import { HomeworkServiceImpl, MemoryHomeworkRepository } from '@/lib/homework';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { PilotHomeworkCorrectionService } from '@/lib/pilot';
import { MemoryPracticeRepository } from '@/lib/practice';
import type {
  CorrectionAIProvider,
  CorrectionGuidance,
  DiagnosisCandidate,
  MistakeDiagnosisContext,
  TrustedCorrectionContext,
} from '@/lib/providers/correction';
import type { HomeworkVisionInput, HomeworkVisionProvider } from '@/lib/providers/homework-vision';

const STUDENT = 'pilot-student';
const OTHER = 'other-student';
const T0 = '2026-08-27T10:00:00.000Z';
const T1 = '2026-08-27T10:01:00.000Z';
const T2 = '2026-08-27T10:02:00.000Z';
const T3 = '2026-08-27T10:03:00.000Z';
const T4 = '2026-08-27T10:04:00.000Z';
const T5 = '2026-08-27T10:05:00.000Z';
const T6 = '2026-08-27T10:06:00.000Z';
const T7 = '2026-08-27T10:07:00.000Z';

function field(value: string, confidence = 0.99) {
  return { value, confidence, region: { x: 0, y: 0, width: 0.2, height: 0.1 } };
}

function lowConfidenceWrongFractionVision(): HomeworkVisionProvider {
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
          answer: field('>', 0.9),
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

class FixtureCorrectionProvider implements CorrectionAIProvider {
  async proposeDiagnosis(_context: MistakeDiagnosisContext): Promise<DiagnosisCandidate> {
    return {
      target: { kind: 'GENERIC', code: 'PROCEDURE_ERROR' },
      rationale: 'Fixture fallback diagnosis.',
    };
  }

  async prepareGuidance(_context: TrustedCorrectionContext): Promise<CorrectionGuidance> {
    return {
      diagnosisExplanation: 'Compare equal-whole fraction sizes.',
      socraticPrompts: ['Which unit fraction is larger?'],
    };
  }
}

async function harness() {
  const learning = new MemoryLearningStateRepository();
  await learning.saveStudent({
    id: STUDENT,
    displayName: 'Pilot learner',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
    createdAt: T0,
    updatedAt: T0,
  });
  await learning.saveStudent({
    id: OTHER,
    displayName: 'Other learner',
    levelId: 'P3',
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
    createdAt: T0,
    updatedAt: T0,
  });

  const homeworkRepository = new MemoryHomeworkRepository();
  const practiceRepository = new MemoryPracticeRepository();
  const mistakeRepository = new MemoryMistakeRepository();
  const resolver = new RepositoryAttemptProblemResolver(practiceRepository, homeworkRepository, learning);
  const correction = new CorrectionServiceImpl(
    mistakeRepository,
    practiceRepository,
    learning,
    resolver,
    new FixtureCorrectionProvider(),
  );
  const observer = new CorrectionAttemptObserver(correction);
  const homework = new HomeworkServiceImpl(
    homeworkRepository,
    practiceRepository,
    learning,
    lowConfidenceWrongFractionVision(),
    observer,
  );
  const service = new PilotHomeworkCorrectionService({
    homework,
    correction,
    homeworkOwnership: homeworkRepository,
    mistakeOwnership: mistakeRepository,
    ids: {
      submissionId: (studentId: string, sha256: string) => `pilot-homework:${studentId}:${sha256.slice(0, 12)}`,
      confirmationId: (problemId: string, studentId: string, at: string) => `pilot-confirm:${problemId}:${studentId}:${at}`,
    },
  });
  return { service, homeworkRepository };
}

function expectStudentSafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'answerSpec',
    'solutionOutline',
    'problemSpec',
    'expectedOptionId',
    '"expected"',
    '"events"',
    '"links"',
    'gradingPolicyVersion',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe('PilotHomeworkCorrectionService', () => {
  it('keeps low-confidence homework out of learning history until parent confirmation, then routes an incorrect Attempt into correction and transfer resolution', async () => {
    const { service, homeworkRepository } = await harness();
    const bytes = new Uint8Array([8, 6, 4, 2]);
    const expectedSha = createHash('sha256').update(bytes).digest('hex');

    const submitted = await service.submitHomework(STUDENT, bytes, 'image/png', T0);
    expect(submitted.submission.sourceSha256).toBe(expectedSha);
    expect(submitted.problems[0]?.trustState).not.toBe('CONFIRMED');
    const problemId = submitted.problems[0]!.problem.id;
    expect((await homeworkRepository.getProblem(problemId))?.studentId).toBe(STUDENT);

    await expect(service.gradeHomeworkProblem(STUDENT, problemId, 'homework-attempt', T1))
      .rejects.toThrow('homework problem is not confirmed');

    const confirmed = await service.confirmHomeworkProblem(
      STUDENT,
      problemId,
      { answer: '>' },
      'PARENT',
      T2,
    );
    expect(confirmed.trustState).toBe('CONFIRMED');

    const graded = await service.gradeHomeworkProblem(STUDENT, problemId, 'homework-attempt', T3);
    expect(graded.attempt).toMatchObject({ studentId: STUDENT, outcome: 'INCORRECT' });

    const open = await service.listOpenMistakes(STUDENT);
    expect(open).toHaveLength(1);
    expectStudentSafe(open);
    const mistakeId = open[0]!.mistakeId;

    const started = await service.startCorrection(STUDENT, mistakeId, T4);
    expectStudentSafe(started);
    expect(started.item).toMatchObject({ kind: 'ORIGINAL_RETRY', prompt: '1/8 ? 1/4' });
    expect(started.reasoningChecks).toEqual([
      expect.objectContaining({
        id: 'reasoning:fraction-part-size',
        kind: 'CHOICE',
        options: expect.arrayContaining([expect.objectContaining({ id: 'SMALLER' })]),
      }),
    ]);
    await service.submitCorrectionRetry(STUDENT, {
      mistakeId,
      correctionItemId: started.item.id,
      attemptId: 'correction-retry',
      answerText: '<',
    }, T5);
    await service.submitReasoningCheck(STUDENT, {
      mistakeId,
      checkId: 'reasoning:fraction-part-size',
      submissionId: 'reasoning-1',
      response: { optionId: 'SMALLER' },
    }, T6);

    const transfer = await service.prepareTransfer(STUDENT, mistakeId, T6);
    expectStudentSafe(transfer);
    expect(transfer).toMatchObject({ kind: 'TRANSFER', transferRound: 1 });
    await service.submitTransferAttempt(STUDENT, {
      mistakeId,
      correctionItemId: transfer.id,
      attemptId: 'transfer-attempt',
      answerText: '>',
    }, T7);

    const resolved = await service.getMistake(STUDENT, mistakeId);
    expect(resolved).toMatchObject({ mistakeId, state: 'RESOLVED' });
    expectStudentSafe(resolved);
  });

  it('rejects cross-student homework and correction commands before delegating mutation', async () => {
    const { service } = await harness();
    const submitted = await service.submitHomework(STUDENT, new Uint8Array([1, 3, 5]), 'image/png', T0);
    const problemId = submitted.problems[0]!.problem.id;

    await expect(service.confirmHomeworkProblem(OTHER, problemId, { answer: '>' }, 'PARENT', T1))
      .rejects.toThrow('homework problem does not belong to student');
    await expect(service.gradeHomeworkProblem(OTHER, problemId, 'foreign-attempt', T1))
      .rejects.toThrow('homework problem does not belong to student');
  });
});
