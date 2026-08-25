import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryHomeworkRepository, HomeworkServiceImpl, evidenceIdForHomeworkAttempt } from '@/lib/homework';
import type { HomeworkVisionProvider, HomeworkVisionInput } from '@/lib/providers/homework-vision';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPracticeRepository } from '@/lib/practice';

const now = '2026-08-25T00:00:00.000Z';
const bytes = new Uint8Array([10, 20, 30]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const region = { x: 0, y: 0, width: 0.2, height: 0.1 };
const field = (value: string, confidence = 0.99) => ({ value, confidence, region });

function provider(confidence = 0.99) {
  let calls = 0;
  const implementation: HomeworkVisionProvider = {
    async extract(input: HomeworkVisionInput) {
      calls += 1;
      return {
        submissionId: input.submissionId, studentId: input.studentId, provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1' as const,
        problems: [{
          id: `${input.submissionId}:problem:1`, submissionId: input.submissionId, studentId: input.studentId, sequence: 1,
          question: field('3 × 4'), answer: field('12', confidence),
          structured: { family: 'ARITHMETIC', fields: { operation: field('MULTIPLY'), left: field('3'), right: field('4') } },
          provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1' as const, createdAt: input.now,
        }],
      };
    },
  };
  return { implementation, calls: () => calls };
}

async function fixture(confidence = 0.99) {
  const homework = new MemoryHomeworkRepository();
  const practice = new MemoryPracticeRepository();
  const learning = new MemoryLearningStateRepository();
  await learning.saveStudent({ id: 's1', displayName: 'Alex', levelId: 'P2', learningMode: 'STRUCTURED_HOME_LEARNING', sessionsPerWeek: 4, minutesPerSession: 30, createdAt: now, updatedAt: now });
  const vision = provider(confidence);
  const service = new HomeworkServiceImpl(homework, practice, learning, vision.implementation);
  return { homework, practice, learning, vision, service };
}

describe('HomeworkService', () => {
  it('deduplicates same student/image and does not create Attempt/Evidence on extraction alone', async () => {
    const { service, vision, learning } = await fixture();
    const input = { submissionId: 'hs-1', studentId: 's1', bytes, mimeType: 'image/png' as const, sha256 };
    const first = await service.submitHomework(input, now);
    const second = await service.submitHomework({ ...input, submissionId: 'hs-other' }, '2026-08-25T00:01:00.000Z');
    expect(second.submission.id).toBe(first.submission.id);
    expect(vision.calls()).toBe(1);
    expect(await learning.listEvidenceForStudent('s1')).toHaveLength(0);
  });

  it('blocks low-confidence handwriting until append-only correction is confirmed', async () => {
    const { service, learning } = await fixture(0.97);
    await service.submitHomework({ submissionId: 'hs-low', studentId: 's1', bytes, mimeType: 'image/png', sha256 }, now);
    await expect(service.gradeHomeworkProblem({ problemId: 'hs-low:problem:1', attemptId: 'a-low' }, now)).rejects.toThrow('homework problem is not confirmed');
    expect(await learning.listEvidenceForStudent('s1')).toHaveLength(0);
    const confirmed = await service.confirmHomeworkProblem({ confirmationId: 'c1', problemId: 'hs-low:problem:1', studentId: 's1', confirmerRole: 'PARENT', corrections: { answer: '12' } }, '2026-08-25T00:01:00.000Z');
    expect(confirmed.trustState).toBe('CONFIRMED');
  });

  it('grades with shared deterministic authority and emits HOMEWORK Evidence', async () => {
    const { service, learning } = await fixture();
    await service.submitHomework({ submissionId: 'hs-grade', studentId: 's1', bytes, mimeType: 'image/png', sha256 }, now);
    const result = await service.gradeHomeworkProblem({ problemId: 'hs-grade:problem:1', attemptId: 'a1' }, '2026-08-25T00:02:00.000Z');
    expect(result.attempt).toMatchObject({ source: { kind: 'HOMEWORK', submissionId: 'hs-grade', problemId: 'hs-grade:problem:1' }, outcome: 'CORRECT', hintUsed: false, objectiveId: 'P2-MD-001' });
    expect(await learning.getEvidence(evidenceIdForHomeworkAttempt('a1'))).toMatchObject({ type: 'independent_correct', origin: { kind: 'HOMEWORK', refId: 'a1' } });
  });

  it('repairs missing Evidence on exact Attempt replay without duplicating Attempt', async () => {
    const { service, practice, learning } = await fixture();
    await service.submitHomework({ submissionId: 'hs-repair', studentId: 's1', bytes, mimeType: 'image/png', sha256 }, now);
    const first = await service.gradeHomeworkProblem({ problemId: 'hs-repair:problem:1', attemptId: 'repair' }, '2026-08-25T00:02:00.000Z');
    const evidence = await learning.getEvidence(evidenceIdForHomeworkAttempt('repair'));
    expect(evidence).toBeDefined();
    // Simulate interrupted Evidence write with a repository wrapper on replay by starting from the stored Attempt in a fresh learning repo.
    const freshLearning = new MemoryLearningStateRepository();
    await freshLearning.saveStudent({ id: 's1', displayName: 'Alex', levelId: 'P2', learningMode: 'STRUCTURED_HOME_LEARNING', sessionsPerWeek: 4, minutesPerSession: 30, createdAt: now, updatedAt: now });
    const replayService = new HomeworkServiceImpl((service as any).homeworkRepository, practice, freshLearning, provider().implementation);
    const replay = await replayService.gradeHomeworkProblem({ problemId: 'hs-repair:problem:1', attemptId: 'repair' }, '2026-08-25T00:03:00.000Z');
    expect(replay.attempt).toEqual(first.attempt);
    expect(await freshLearning.getEvidence(evidenceIdForHomeworkAttempt('repair'))).toBeDefined();
  });
});
