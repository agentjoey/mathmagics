import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HomeworkServiceImpl, MemoryHomeworkRepository, evidenceIdForHomeworkAttempt } from '@/lib/homework';
import type { HomeworkVisionInput, HomeworkVisionProvider } from '@/lib/providers/homework-vision';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPracticeRepository } from '@/lib/practice';

const NOW = '2026-08-25T02:00:00.000Z';
const region = { x: 0, y: 0, width: 0.2, height: 0.1 };
const f = (value: string, confidence = 0.99) => ({ value, confidence, region });

type ProblemFixture = { family: string; fields: Record<string, string>; answer?: string; answerConfidence?: number };

function vision(problem: ProblemFixture): HomeworkVisionProvider {
  return {
    async extract(input: HomeworkVisionInput) {
      return {
        submissionId: input.submissionId, studentId: input.studentId, provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1',
        problems: [{
          id: `${input.submissionId}:problem:1`, submissionId: input.submissionId, studentId: input.studentId, sequence: 1,
          question: f('fixture question'), answer: problem.answer === undefined ? undefined : f(problem.answer, problem.answerConfidence ?? 0.99),
          structured: { family: problem.family, fields: Object.fromEntries(Object.entries(problem.fields).map(([key, value]) => [key, f(value)])) },
          provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1', createdAt: input.now,
        }],
      };
    },
  };
}

async function harness(levelId: 'P2' | 'P3', problem: ProblemFixture) {
  const homework = new MemoryHomeworkRepository();
  const practice = new MemoryPracticeRepository();
  const learning = new MemoryLearningStateRepository();
  await learning.saveStudent({ id: 's1', displayName: 'Learner', levelId, learningMode: 'STRUCTURED_HOME_LEARNING', sessionsPerWeek: 4, minutesPerSession: 30, createdAt: NOW, updatedAt: NOW });
  const service = new HomeworkServiceImpl(homework, practice, learning, vision(problem));
  return { homework, practice, learning, service };
}

function image(seed: number) {
  const bytes = new Uint8Array([seed, seed + 1, seed + 2]);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function submit(service: HomeworkServiceImpl, submissionId: string, seed: number) {
  const source = image(seed);
  return service.submitHomework({ submissionId, studentId: 's1', bytes: source.bytes, mimeType: 'image/png', sha256: source.sha256 }, NOW);
}

describe('Phase 5 homework vision end-to-end', () => {
  it('P2 clear multiplication flows to P2-MD-001 HOMEWORK evidence', async () => {
    const { service, learning } = await harness('P2', { family: 'ARITHMETIC', fields: { operation: 'MULTIPLY', left: '3', right: '4' }, answer: '12' });
    await submit(service, 'hs-p2', 1);
    const result = await service.gradeHomeworkProblem({ problemId: 'hs-p2:problem:1', attemptId: 'a-p2' }, '2026-08-25T02:01:00.000Z');
    expect(result.attempt.objectiveId).toBe('P2-MD-001');
    expect(await learning.getEvidence(evidenceIdForHomeworkAttempt('a-p2'))).toMatchObject({ origin: { kind: 'HOMEWORK', refId: 'a-p2' } });
  });

  it('P3 fraction addition flows to P3-FRA-005', async () => {
    const { service } = await harness('P3', { family: 'FRACTION_OPERATION', fields: { operation: 'ADD', leftNumerator: '1', leftDenominator: '4', rightNumerator: '1', rightDenominator: '2' }, answer: '3/4' });
    await submit(service, 'hs-p3', 2);
    const result = await service.gradeHomeworkProblem({ problemId: 'hs-p3:problem:1', attemptId: 'a-p3' }, '2026-08-25T02:01:00.000Z');
    expect(result.attempt).toMatchObject({ objectiveId: 'P3-FRA-005', outcome: 'CORRECT' });
  });

  it('low-confidence handwriting creates no learning history until confirmation', async () => {
    const { service, learning } = await harness('P2', { family: 'ARITHMETIC', fields: { operation: 'MULTIPLY', left: '3', right: '4' }, answer: '12', answerConfidence: 0.9 });
    await submit(service, 'hs-low-e2e', 3);
    await expect(service.gradeHomeworkProblem({ problemId: 'hs-low-e2e:problem:1', attemptId: 'a-low' }, NOW)).rejects.toThrow('homework problem is not confirmed');
    expect(await learning.listEvidenceForStudent('s1')).toHaveLength(0);
    await service.confirmHomeworkProblem({ confirmationId: 'c-low', problemId: 'hs-low-e2e:problem:1', studentId: 's1', confirmerRole: 'PARENT', corrections: { answer: '12' } }, '2026-08-25T02:01:00.000Z');
    await service.gradeHomeworkProblem({ problemId: 'hs-low-e2e:problem:1', attemptId: 'a-low' }, '2026-08-25T02:02:00.000Z');
    expect(await learning.listEvidenceForStudent('s1')).toHaveLength(1);
  });

  it('incorrect supported answer remains an immutable incorrect Attempt and Evidence', async () => {
    const { service, learning } = await harness('P2', { family: 'ARITHMETIC', fields: { operation: 'MULTIPLY', left: '3', right: '4' }, answer: '11' });
    await submit(service, 'hs-wrong', 4);
    const result = await service.gradeHomeworkProblem({ problemId: 'hs-wrong:problem:1', attemptId: 'a-wrong' }, '2026-08-25T02:01:00.000Z');
    expect(result.attempt.outcome).toBe('INCORRECT');
    expect((await learning.getEvidence(evidenceIdForHomeworkAttempt('a-wrong')))?.type).toBe('incorrect');
  });

  it('duplicate same-image submission is idempotent and does not duplicate learning history', async () => {
    const { service, learning } = await harness('P2', { family: 'ARITHMETIC', fields: { operation: 'MULTIPLY', left: '3', right: '4' }, answer: '12' });
    const source = image(5);
    const input = { submissionId: 'hs-dedup', studentId: 's1', bytes: source.bytes, mimeType: 'image/png' as const, sha256: source.sha256 };
    await service.submitHomework(input, NOW);
    const duplicate = await service.submitHomework({ ...input, submissionId: 'hs-other' }, '2026-08-25T02:01:00.000Z');
    expect(duplicate.submission.id).toBe('hs-dedup');
    await service.gradeHomeworkProblem({ problemId: 'hs-dedup:problem:1', attemptId: 'a-dedup' }, '2026-08-25T02:02:00.000Z');
    await service.gradeHomeworkProblem({ problemId: 'hs-dedup:problem:1', attemptId: 'a-dedup' }, '2026-08-25T02:03:00.000Z');
    expect(await learning.listEvidenceForStudent('s1')).toHaveLength(1);
  });

  it('high-confidence but mathematically invalid structure fails closed', async () => {
    const { service, learning } = await harness('P3', { family: 'FRACTION_SIMPLIFY', fields: { numerator: '1', denominator: '0' }, answer: '1' });
    const projection = await submit(service, 'hs-invalid', 6);
    expect(projection.problems[0]?.trustState).toBe('UNSUPPORTED');
    await expect(service.gradeHomeworkProblem({ problemId: 'hs-invalid:problem:1', attemptId: 'a-invalid' }, NOW)).rejects.toThrow('homework problem is not confirmed');
    expect(await learning.listEvidenceForStudent('s1')).toHaveLength(0);
  });

  it('open-ended unsupported question creates no Attempt or Evidence', async () => {
    const { service, learning, practice } = await harness('P2', { family: 'OPEN_EXPLANATION', fields: { prompt: 'Explain why.' }, answer: 'because' });
    const projection = await submit(service, 'hs-open', 7);
    expect(projection.problems[0]?.trustState).toBe('UNSUPPORTED');
    await expect(service.gradeHomeworkProblem({ problemId: 'hs-open:problem:1', attemptId: 'a-open' }, NOW)).rejects.toThrow();
    expect(await practice.getAttempt('a-open')).toBeUndefined();
    expect(await learning.listEvidenceForStudent('s1')).toHaveLength(0);
  });

  it('replay repairs Evidence exactly once after an interrupted projection', async () => {
    const { service, homework, practice } = await harness('P2', { family: 'ARITHMETIC', fields: { operation: 'MULTIPLY', left: '3', right: '4' }, answer: '12' });
    await submit(service, 'hs-repair-e2e', 8);
    const firstLearning = new MemoryLearningStateRepository();
    await firstLearning.saveStudent({ id: 's1', displayName: 'Learner', levelId: 'P2', learningMode: 'STRUCTURED_HOME_LEARNING', sessionsPerWeek: 4, minutesPerSession: 30, createdAt: NOW, updatedAt: NOW });
    const interrupted = new HomeworkServiceImpl(homework, practice, firstLearning, vision({ family: 'ARITHMETIC', fields: { operation: 'MULTIPLY', left: '3', right: '4' }, answer: '12' }));
    await interrupted.gradeHomeworkProblem({ problemId: 'hs-repair-e2e:problem:1', attemptId: 'a-repair-e2e' }, '2026-08-25T02:01:00.000Z');
    const secondLearning = new MemoryLearningStateRepository();
    await secondLearning.saveStudent({ id: 's1', displayName: 'Learner', levelId: 'P2', learningMode: 'STRUCTURED_HOME_LEARNING', sessionsPerWeek: 4, minutesPerSession: 30, createdAt: NOW, updatedAt: NOW });
    const replay = new HomeworkServiceImpl(homework, practice, secondLearning, vision({ family: 'ARITHMETIC', fields: { operation: 'MULTIPLY', left: '3', right: '4' }, answer: '12' }));
    await replay.gradeHomeworkProblem({ problemId: 'hs-repair-e2e:problem:1', attemptId: 'a-repair-e2e' }, '2026-08-25T02:02:00.000Z');
    await replay.gradeHomeworkProblem({ problemId: 'hs-repair-e2e:problem:1', attemptId: 'a-repair-e2e' }, '2026-08-25T02:03:00.000Z');
    expect(await secondLearning.listEvidenceForStudent('s1')).toHaveLength(1);
  });
});
