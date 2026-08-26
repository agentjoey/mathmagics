import { describe, expect, it } from 'vitest';
import { MemoryPracticeRepository } from '@/lib/practice';
import type { Attempt, PracticeItem, PracticeSession } from '@/lib/practice';

const session: PracticeSession = {
  id: 'session-progress', studentId: 's1', lessonId: 'lesson-progress', objectiveId: 'P2-AS-002',
  policyVersion: 'practice-v1', createdAt: '2026-08-26T00:00:00.000Z',
};
const item: PracticeItem = {
  id: 'item-progress', sessionId: session.id, studentId: 's1', objectiveId: session.objectiveId, sequence: 1,
  difficultyBand: 'CORE', problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 2, right: 2 },
  prompt: '2 × 2?', answerSpec: { kind: 'INTEGER', value: '4' }, solutionOutline: ['2 × 2 = 4'],
  generator: 'test', generatorVersion: '1', createdAt: session.createdAt,
};

function attempt(id: string, submittedAt: string, studentId = 's1', source: Attempt['source'] = { kind: 'PRACTICE', sessionId: session.id, itemId: item.id }): Attempt {
  return {
    id, source, studentId, objectiveId: session.objectiveId, answerText: '4', outcome: 'CORRECT', hintUsed: false,
    gradingPolicyVersion: 'grading-v1', submittedAt, recordedAt: submittedAt,
  };
}

describe('PracticeRepository listAttemptsForStudent', () => {
  it('returns all source kinds for one student in submittedAt/id order and defensive clones', async () => {
    const repository = new MemoryPracticeRepository();
    await repository.createPracticeSession(session, [item]);
    await repository.appendAttempt(attempt('a-new', '2026-08-26T00:03:00.000Z'));
    await repository.appendAttempt(attempt('a-homework', '2026-08-26T00:01:00.000Z', 's1', { kind: 'HOMEWORK', submissionId: 'hs1', problemId: 'hp1' }));
    await repository.appendAttempt(attempt('a-correction', '2026-08-26T00:02:00.000Z', 's1', { kind: 'CORRECTION', mistakeId: 'm1', correctionItemId: 'ci1' }));
    await repository.appendAttempt(attempt('a-other-student', '2026-08-26T00:00:00.000Z', 's2', { kind: 'HOMEWORK', submissionId: 'hs2', problemId: 'hp2' }));
    await repository.appendAttempt(attempt('a-same-b', '2026-08-26T00:04:00.000Z', 's1', { kind: 'HOMEWORK', submissionId: 'hs3', problemId: 'hp3' }));
    await repository.appendAttempt(attempt('a-same-a', '2026-08-26T00:04:00.000Z', 's1', { kind: 'HOMEWORK', submissionId: 'hs4', problemId: 'hp4' }));

    const returned = await repository.listAttemptsForStudent('s1');
    expect(returned.map((entry) => entry.id)).toEqual(['a-homework', 'a-correction', 'a-new', 'a-same-a', 'a-same-b']);
    returned[0]!.answerText = 'tampered';
    expect((await repository.listAttemptsForStudent('s1'))[0]!.answerText).toBe('4');
  });
});
