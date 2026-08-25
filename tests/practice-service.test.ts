import { describe, expect, it } from 'vitest';
import { MemoryLearningStateRepository, type EvidenceRecord, type StudentProfile } from '@/lib/learning';
import { MemoryPlanningRepository, type DailyLesson, type WeeklyPlan } from '@/lib/planning';
import {
  MemoryPracticeRepository,
  PracticeServiceImpl,
  evidenceIdForAttempt,
  type Attempt,
  type PracticeIdFactory,
} from '@/lib/practice';

const NOW = '2026-08-25T00:10:00.000Z';
const student: StudentProfile = {
  id: 's1', displayName: 'Alex', levelId: 'P2', learningMode: 'STRUCTURED_HOME_LEARNING',
  sessionsPerWeek: 4, minutesPerSession: 30,
  createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
};
const plan: WeeklyPlan = {
  id: 'plan-1', studentId: 's1', weekStart: '2026-08-24', sessionsPerWeek: 4,
  minutesPerSession: 30, createdAt: '2026-08-25T00:00:00.000Z',
};
const lesson: DailyLesson = {
  id: 'lesson-1', weeklyPlanId: 'plan-1', studentId: 's1', sequence: 1, intent: 'PRACTICE',
  objectiveIds: ['P2-MD-001'], estimatedMinutes: 30,
  rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-MD-001' }],
  createdAt: '2026-08-25T00:00:00.000Z',
};
const idFactory: PracticeIdFactory = {
  sessionId: (lessonId, objectiveId) => `session:${lessonId}:${objectiveId}`,
  itemId: (sessionId, sequence) => `${sessionId}:item:${sequence}`,
};

function prereqEvidence(index: number): EvidenceRecord {
  return {
    id: `pre-${index}`, studentId: 's1', objectiveId: 'P2-WN-005',
    type: index === 3 ? 'application_correct' : 'independent_correct',
    observedAt: `2026-08-24T00:0${index}:00.000Z`, recordedAt: `2026-08-24T00:0${index}:00.000Z`,
    origin: { kind: 'SETUP', refId: `setup-${index}` },
  };
}

async function setup(objectiveId = 'P2-MD-001') {
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  const practice = new MemoryPracticeRepository();
  await learning.saveStudent(student);
  for (let index = 1; index <= 3; index += 1) await learning.appendEvidence(prereqEvidence(index));
  const selectedLesson = { ...lesson, objectiveIds: [objectiveId], rationale: [{ code: 'CURRENT_POSITION' as const, objectiveId }] };
  await planning.createWeeklyPlan(plan, [selectedLesson]);
  const service = new PracticeServiceImpl(learning, planning, practice, idFactory);
  return { learning, planning, practice, service };
}

async function firstItemAnswer(practice: MemoryPracticeRepository, sessionId: string): Promise<{ itemId: string; answer: string }> {
  const [item] = await practice.listPracticeItems(sessionId);
  if (!item) throw new Error('missing fixture item');
  if (item.answerSpec.kind !== 'INTEGER') throw new Error('fixture expected integer item');
  return { itemId: item.id, answer: item.answerSpec.value };
}

describe('PracticeService orchestration', () => {
  it('creates exactly four deterministic items and returns the existing immutable session on replay', async () => {
    const { practice, service } = await setup();
    const first = await service.createPracticeSession('lesson-1', 'P2-MD-001', NOW);
    const second = await service.createPracticeSession('lesson-1', 'P2-MD-001', '2026-08-25T00:20:00.000Z');
    expect(second).toEqual(first);
    const items = await practice.listPracticeItems(first.id);
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.difficultyBand)).toEqual(['FOUNDATION', 'FOUNDATION', 'CORE', 'CORE']);
  });

  it('fails closed for an unsupported real objective without persisting a session', async () => {
    const { practice, service } = await setup('P2-AS-003');
    await expect(service.createPracticeSession('lesson-1', 'P2-AS-003', NOW))
      .rejects.toThrow('Unsupported practice objective: P2-AS-003');
    expect(await practice.findPracticeSession('lesson-1', 'P2-AS-003')).toBeUndefined();
  });

  it('records hint use as a server-observed fact and makes replay idempotent', async () => {
    const { practice, service } = await setup();
    const session = await service.createPracticeSession('lesson-1', 'P2-MD-001', NOW);
    const { itemId } = await firstItemAnswer(practice, session.id);
    const first = await service.revealHint(session.id, itemId, '2026-08-25T00:11:00.000Z');
    const second = await service.revealHint(session.id, itemId, '2026-08-25T00:12:00.000Z');
    expect(first).toBe(second);
    expect(await practice.listHintReveals(itemId)).toHaveLength(1);
  });

  it('projects an independent correct attempt into stable PRACTICE evidence', async () => {
    const { learning, practice, service } = await setup();
    const session = await service.createPracticeSession('lesson-1', 'P2-MD-001', NOW);
    const { itemId, answer } = await firstItemAnswer(practice, session.id);
    const attempt = await service.submitAttempt({ attemptId: 'a1', sessionId: session.id, itemId, answerText: answer }, '2026-08-25T00:12:00.000Z');
    expect(attempt).toMatchObject({ outcome: 'CORRECT', hintUsed: false });
    expect(await learning.getEvidence(evidenceIdForAttempt('a1'))).toMatchObject({
      type: 'independent_correct', origin: { kind: 'PRACTICE', refId: 'a1' },
    });
  });

  it('projects hinted correct and wrong→retry→correct with precedence preserved', async () => {
    const { learning, practice, service } = await setup();
    const session = await service.createPracticeSession('lesson-1', 'P2-MD-001', NOW);
    const items = await practice.listPracticeItems(session.id);
    const first = items[0]!;
    const second = items[1]!;
    if (first.answerSpec.kind !== 'INTEGER' || second.answerSpec.kind !== 'INTEGER') throw new Error('fixture expected integers');

    await service.revealHint(session.id, first.id, '2026-08-25T00:11:00.000Z');
    await service.submitAttempt({ attemptId: 'hinted', sessionId: session.id, itemId: first.id, answerText: first.answerSpec.value }, '2026-08-25T00:12:00.000Z');
    expect((await learning.getEvidence(evidenceIdForAttempt('hinted')))?.type).toBe('correct_with_hint');

    await service.submitAttempt({ attemptId: 'wrong', sessionId: session.id, itemId: second.id, answerText: '999' }, '2026-08-25T00:13:00.000Z');
    await service.submitAttempt({ attemptId: 'retry', sessionId: session.id, itemId: second.id, answerText: second.answerSpec.value, retryOfAttemptId: 'wrong' }, '2026-08-25T00:14:00.000Z');
    expect((await learning.getEvidence(evidenceIdForAttempt('wrong')))?.type).toBe('incorrect');
    expect((await learning.getEvidence(evidenceIdForAttempt('retry')))?.type).toBe('corrected');
    expect((await practice.listAttemptsForItem(second.id)).map((attempt) => attempt.id)).toEqual(['wrong', 'retry']);
  });

  it('replays an exact stored Attempt to repair missing Evidence without duplicating the Attempt', async () => {
    const { learning, practice, service } = await setup();
    const session = await service.createPracticeSession('lesson-1', 'P2-MD-001', NOW);
    const { itemId, answer } = await firstItemAnswer(practice, session.id);
    const seeded: Attempt = {
      id: 'repair', sessionId: session.id, itemId, studentId: 's1', objectiveId: 'P2-MD-001',
      answerText: answer, outcome: 'CORRECT', hintUsed: false, gradingPolicyVersion: 'grading-v1',
      submittedAt: '2026-08-25T00:12:00.000Z', recordedAt: '2026-08-25T00:12:00.000Z',
    };
    await practice.appendAttempt(seeded);
    expect(await learning.getEvidence(evidenceIdForAttempt('repair'))).toBeUndefined();
    const replay = await service.submitAttempt({ attemptId: 'repair', sessionId: session.id, itemId, answerText: answer }, '2026-08-25T00:20:00.000Z');
    expect(replay).toEqual(seeded);
    expect(await practice.listAttemptsForItem(itemId)).toHaveLength(1);
    expect(await learning.getEvidence(evidenceIdForAttempt('repair'))).toBeDefined();
  });

  it('rejects a conflicting reuse of an Attempt idempotency key', async () => {
    const { practice, service } = await setup();
    const session = await service.createPracticeSession('lesson-1', 'P2-MD-001', NOW);
    const { itemId, answer } = await firstItemAnswer(practice, session.id);
    await service.submitAttempt({ attemptId: 'same', sessionId: session.id, itemId, answerText: answer }, '2026-08-25T00:12:00.000Z');
    await expect(service.submitAttempt({ attemptId: 'same', sessionId: session.id, itemId, answerText: 'different' }, '2026-08-25T00:13:00.000Z'))
      .rejects.toThrow('attempt idempotency conflict');
  });
});
