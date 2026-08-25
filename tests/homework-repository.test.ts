import { describe, expect, it } from 'vitest';
import { MemoryHomeworkRepository } from '@/lib/homework';
import type {
  HomeworkConfirmation,
  HomeworkProblemExtraction,
  HomeworkSubmission,
} from '@/lib/homework';

const region = { x: 0.1, y: 0.1, width: 0.2, height: 0.1 };
const submission: HomeworkSubmission = {
  id: 'hs-1', studentId: 's1', sourceSha256: 'a'.repeat(64), mimeType: 'image/jpeg', byteLength: 100,
  provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1', createdAt: '2026-08-25T00:00:00.000Z',
};

function problem(id: string, sequence: number): HomeworkProblemExtraction {
  return {
    id, submissionId: submission.id, studentId: submission.studentId, sequence,
    question: { value: `Question ${sequence}`, confidence: 0.99, region },
    answer: { value: String(sequence), confidence: 0.99, region },
    structured: { family: 'ARITHMETIC', fields: { left: { value: '2', confidence: 0.99, region } } },
    provider: submission.provider, model: submission.model, schemaVersion: 'homework-vision-v1', createdAt: submission.createdAt,
  };
}

function confirmation(
  id: string,
  confirmedAt: string,
  corrections: Record<string, string> = { answer: '2' },
): HomeworkConfirmation {
  return {
    id, problemId: 'hp-1', studentId: 's1', corrections, confirmerRole: 'PARENT',
    policyVersion: 'homework-confidence-v1', confirmedAt,
  };
}

describe('MemoryHomeworkRepository', () => {
  it('creates immutable submission/problem facts and reads them in sequence order', async () => {
    const repository = new MemoryHomeworkRepository();
    await repository.createSubmission(submission, [problem('hp-2', 2), problem('hp-1', 1)]);
    expect(await repository.getSubmission(submission.id)).toEqual(submission);
    expect(await repository.findSubmissionByStudentAndHash('s1', submission.sourceSha256)).toEqual(submission);
    expect((await repository.listProblems(submission.id)).map((entry) => entry.id)).toEqual(['hp-1', 'hp-2']);

    const read = await repository.getProblem('hp-1');
    if (!read) throw new Error('missing fixture problem');
    read.question.value = 'tampered';
    expect((await repository.getProblem('hp-1'))?.question.value).toBe('Question 1');
  });

  it('rejects duplicate submission ids and duplicate student/hash coordinates', async () => {
    const repository = new MemoryHomeworkRepository();
    await repository.createSubmission(submission, [problem('hp-1', 1)]);
    await expect(repository.createSubmission(submission, [problem('hp-x', 1)]))
      .rejects.toThrow('homework submission id already exists');
    await expect(repository.createSubmission({ ...submission, id: 'hs-2' }, [{ ...problem('hp-y', 1), submissionId: 'hs-2' }]))
      .rejects.toThrow('homework submission already exists for student and source hash');
  });

  it('rejects duplicate problem ids/sequences and coordinate mismatches atomically', async () => {
    const repository = new MemoryHomeworkRepository();
    await expect(repository.createSubmission(submission, [problem('same', 1), problem('same', 2)]))
      .rejects.toThrow('homework problem id must be unique');
    await expect(repository.createSubmission(submission, [problem('one', 1), problem('two', 1)]))
      .rejects.toThrow('homework problem sequence must be unique within submission');
    await expect(repository.createSubmission(submission, [{ ...problem('wrong', 1), studentId: 's2' }]))
      .rejects.toThrow('homework problem coordinates must match submission');
    expect(await repository.getSubmission(submission.id)).toBeUndefined();
  });

  it('appends confirmations without overwriting extraction and sorts them deterministically', async () => {
    const repository = new MemoryHomeworkRepository();
    await repository.createSubmission(submission, [problem('hp-1', 1)]);
    await repository.appendConfirmation(confirmation('hc-z', '2026-08-25T00:02:00.000Z', { answer: '3' }));
    await repository.appendConfirmation(confirmation('hc-a', '2026-08-25T00:01:00.000Z'));
    expect((await repository.listConfirmations('hp-1')).map((entry) => entry.id)).toEqual(['hc-a', 'hc-z']);
    expect((await repository.getProblem('hp-1'))?.answer?.value).toBe('1');
    await expect(repository.appendConfirmation(confirmation('hc-a', '2026-08-25T00:03:00.000Z')))
      .rejects.toThrow('homework confirmation id already exists');
  });

  it('rejects confirmations for unknown/mismatched problems or forbidden correction fields', async () => {
    const repository = new MemoryHomeworkRepository();
    await repository.createSubmission(submission, [problem('hp-1', 1)]);
    await expect(repository.appendConfirmation({ ...confirmation('missing', '2026-08-25T00:01:00.000Z'), problemId: 'missing' }))
      .rejects.toThrow('Unknown homework problem id: missing');
    await expect(repository.appendConfirmation({ ...confirmation('wrong-student', '2026-08-25T00:01:00.000Z'), studentId: 's2' }))
      .rejects.toThrow('homework confirmation coordinates must match problem');
    await expect(repository.appendConfirmation(confirmation('authority', '2026-08-25T00:01:00.000Z', { objectiveId: 'P2-MD-001' })))
      .rejects.toThrow('homework confirmation correction field is not allowed');
  });
});
