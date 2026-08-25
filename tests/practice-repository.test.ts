import { describe, expect, it } from 'vitest';
import {
  MemoryPracticeRepository,
} from '@/lib/practice';
import type {
  Attempt,
  PracticeHintReveal,
  PracticeItem,
  PracticeRepository,
  PracticeSession,
} from '@/lib/practice';

const session: PracticeSession = {
  id: 'session-1',
  studentId: 'student-1',
  lessonId: 'lesson-1',
  objectiveId: 'P2-MD-001',
  policyVersion: 'practice-v1',
  createdAt: '2026-08-25T00:00:00.000Z',
};

function item(id: string, sequence: number, overrides: Partial<PracticeItem> = {}): PracticeItem {
  return {
    id,
    sessionId: session.id,
    studentId: session.studentId,
    objectiveId: session.objectiveId,
    sequence,
    difficultyBand: 'CORE',
    problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 2, right: sequence + 1 },
    prompt: `What is 2 × ${sequence + 1}?`,
    answerSpec: { kind: 'INTEGER', value: String(2 * (sequence + 1)) },
    hint: 'Think in equal groups.',
    solutionOutline: [`2 × ${sequence + 1} = ${2 * (sequence + 1)}`],
    generator: 'test',
    generatorVersion: '1',
    createdAt: session.createdAt,
    ...overrides,
  };
}

function reveal(id = 'reveal-1', overrides: Partial<PracticeHintReveal> = {}): PracticeHintReveal {
  return {
    id,
    sessionId: session.id,
    itemId: 'item-1',
    studentId: session.studentId,
    revealedAt: '2026-08-25T00:01:00.000Z',
    ...overrides,
  };
}

type AttemptOverrides = Partial<Attempt> & { sessionId?: string; itemId?: string };

function attempt(id: string, submittedAt: string, overrides: AttemptOverrides = {}): Attempt {
  const { sessionId = session.id, itemId = 'item-1', ...rest } = overrides;
  return {
    id,
    source: { kind: 'PRACTICE', sessionId, itemId },
    studentId: session.studentId,
    objectiveId: session.objectiveId,
    answerText: '4',
    outcome: 'CORRECT',
    hintUsed: false,
    gradingPolicyVersion: 'grading-v1',
    submittedAt,
    recordedAt: submittedAt,
    ...rest,
  };
}

async function seeded(repository: PracticeRepository): Promise<void> {
  await repository.createPracticeSession(session, [item('item-1', 1), item('item-2', 2)]);
}

describe('MemoryPracticeRepository', () => {
  it('creates a session and items atomically, with sorted item reads', async () => {
    const repository = new MemoryPracticeRepository();
    await repository.createPracticeSession(session, [item('item-2', 2), item('item-1', 1)]);

    expect(await repository.getPracticeSession(session.id)).toEqual(session);
    expect(await repository.findPracticeSession(session.lessonId, session.objectiveId)).toEqual(session);
    expect((await repository.listPracticeItems(session.id)).map((entry) => entry.id)).toEqual(['item-1', 'item-2']);
  });

  it('validates the entire session/item bundle before mutating repository state', async () => {
    const repository = new MemoryPracticeRepository();
    const invalid = item('bad', 2, { objectiveId: 'P2-MD-002' });

    await expect(repository.createPracticeSession(session, [item('item-1', 1), invalid]))
      .rejects.toThrow('practice item objectiveId must match practice session objectiveId');

    expect(await repository.getPracticeSession(session.id)).toBeUndefined();
    expect(await repository.getPracticeItem('item-1')).toBeUndefined();
  });

  it('rejects duplicate session ids and duplicate lesson/objective coordinates', async () => {
    const repository = new MemoryPracticeRepository();
    await seeded(repository);

    await expect(repository.createPracticeSession(session, [item('item-3', 3)]))
      .rejects.toThrow('practice session id already exists');
    await expect(repository.createPracticeSession(
      { ...session, id: 'session-2' },
      [item('item-x', 1, { sessionId: 'session-2' })],
    )).rejects.toThrow('practice session already exists for lesson and objective');
  });

  it('rejects duplicate item ids and duplicate sequence within a bundle', async () => {
    const repository = new MemoryPracticeRepository();
    await expect(repository.createPracticeSession(session, [item('same', 1), item('same', 2)]))
      .rejects.toThrow('practice item id must be unique');
    await expect(repository.createPracticeSession(session, [item('one', 1), item('two', 1)]))
      .rejects.toThrow('practice item sequence must be unique within practice session');
  });

  it('records hint reveals only for matching known items and prevents duplicate reveal per student/item', async () => {
    const repository = new MemoryPracticeRepository();
    await seeded(repository);
    await repository.appendHintReveal(reveal());

    expect(await repository.listHintReveals('item-1')).toEqual([reveal()]);
    await expect(repository.appendHintReveal(reveal('reveal-2', { revealedAt: '2026-08-25T00:02:00.000Z' })))
      .rejects.toThrow('practice hint already revealed for student and item');
    await expect(repository.appendHintReveal(reveal('unknown', { itemId: 'missing' })))
      .rejects.toThrow('Unknown practice item id: missing');
    await expect(repository.appendHintReveal(reveal('wrong-student', { studentId: 'student-2' })))
      .rejects.toThrow('practice hint reveal coordinates must match practice item');
  });

  it('appends attempts only for matching known items and returns deterministic order', async () => {
    const repository = new MemoryPracticeRepository();
    await seeded(repository);
    await repository.appendAttempt(attempt('b', '2026-08-25T00:02:00.000Z'));
    await repository.appendAttempt(attempt('c', '2026-08-25T00:01:00.000Z', { recordedAt: '2026-08-25T00:01:01.000Z', outcome: 'INCORRECT', answerText: '5' }));
    await repository.appendAttempt(attempt('a', '2026-08-25T00:01:00.000Z', { outcome: 'INCORRECT', answerText: '5' }));

    expect((await repository.listAttemptsForItem('item-1')).map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
    expect((await repository.listAttemptsForSession(session.id)).map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
    await expect(repository.appendAttempt(attempt('missing-item', '2026-08-25T00:03:00.000Z', { itemId: 'missing' })))
      .rejects.toThrow('Unknown practice item id: missing');
    await expect(repository.appendAttempt(attempt('wrong-objective', '2026-08-25T00:03:00.000Z', { objectiveId: 'P2-MD-002' })))
      .rejects.toThrow('attempt coordinates must match practice item');
  });

  it('rejects duplicate attempt ids and branching retry children', async () => {
    const repository = new MemoryPracticeRepository();
    await seeded(repository);
    const root = attempt('root', '2026-08-25T00:01:00.000Z', { outcome: 'INCORRECT', answerText: '5' });
    await repository.appendAttempt(root);
    await expect(repository.appendAttempt(root)).rejects.toThrow('attempt id already exists');

    await repository.appendAttempt(attempt('retry-1', '2026-08-25T00:02:00.000Z', { retryOfAttemptId: 'root' }));
    await expect(repository.appendAttempt(attempt('retry-2', '2026-08-25T00:03:00.000Z', { retryOfAttemptId: 'root' })))
      .rejects.toThrow('retry parent already has a retry child');
  });

  it('does not expose HOMEWORK attempts through practice item/session queries', async () => {
    const repository = new MemoryPracticeRepository();
    await seeded(repository);
    await repository.appendAttempt({
      id: 'homework-1', source: { kind: 'HOMEWORK', submissionId: 'hs-1', problemId: 'hp-1' },
      studentId: session.studentId, objectiveId: session.objectiveId, answerText: '4', outcome: 'CORRECT', hintUsed: false,
      gradingPolicyVersion: 'grading-v1', submittedAt: '2026-08-25T00:03:00.000Z', recordedAt: '2026-08-25T00:03:00.000Z',
    });
    expect(await repository.getAttempt('homework-1')).toBeDefined();
    expect(await repository.listAttemptsForItem('item-1')).toEqual([]);
    expect(await repository.listAttemptsForSession(session.id)).toEqual([]);
  });

  it('returns defensive clones including nested practice item data', async () => {
    const repository = new MemoryPracticeRepository();
    await seeded(repository);
    const returned = await repository.getPracticeItem('item-1');
    if (!returned) throw new Error('fixture missing');
    returned.solutionOutline[0] = 'tampered';
    if (returned.problemSpec.kind === 'ARITHMETIC') returned.problemSpec.left = 999;

    const reread = await repository.getPracticeItem('item-1');
    expect(reread?.solutionOutline[0]).not.toBe('tampered');
    expect(reread?.problemSpec).toMatchObject({ kind: 'ARITHMETIC', left: 2 });
  });
});
