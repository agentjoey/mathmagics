import { describe, expect, it } from 'vitest';
import {
  MemoryLearningStateRepository,
  getObjectiveMastery,
  type EvidenceRecord,
  type StudentLevel,
  type StudentProfile,
} from '@/lib/learning';
import { MemoryPlanningRepository, type DailyLesson, type WeeklyPlan } from '@/lib/planning';
import {
  MemoryPracticeRepository,
  PracticeServiceImpl,
  evidenceIdForAttempt,
  type AnswerSpec,
  type Attempt,
  type PracticeIdFactory,
} from '@/lib/practice';

const CREATED = '2026-08-25T01:00:00.000Z';
const idFactory: PracticeIdFactory = {
  sessionId: (lessonId, objectiveId) => `session:${lessonId}:${objectiveId}`,
  itemId: (sessionId, sequence) => `${sessionId}:item:${sequence}`,
};

function answerText(spec: AnswerSpec): string {
  switch (spec.kind) {
    case 'INTEGER':
    case 'DECIMAL': return spec.value;
    case 'FRACTION': return `${spec.numerator}/${spec.denominator}`;
    case 'CHOICE': return spec.optionId;
    case 'EXACT_TEXT': return spec.acceptedValues[0]!;
  }
}

async function seedMastered(
  repository: MemoryLearningStateRepository,
  studentId: string,
  objectiveId: string,
  stem: string,
): Promise<void> {
  for (let index = 1; index <= 3; index += 1) {
    const record: EvidenceRecord = {
      id: `${stem}-${index}`,
      studentId,
      objectiveId,
      type: index === 3 ? 'application_correct' : 'independent_correct',
      observedAt: `2026-08-24T01:0${index}:00.000Z`,
      recordedAt: `2026-08-24T01:0${index}:00.000Z`,
      origin: { kind: 'SETUP', refId: `${stem}-setup-${index}` },
    };
    await repository.appendEvidence(record);
  }
}

async function harness(levelId: StudentLevel, objectiveId: string) {
  const studentId = `student-${levelId}`;
  const student: StudentProfile = {
    id: studentId,
    displayName: levelId === 'P2' ? 'P2 Learner' : 'P3 Learner',
    levelId,
    learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  const practice = new MemoryPracticeRepository();
  await learning.saveStudent(student);

  if (objectiveId === 'P2-MD-001') {
    await seedMastered(learning, studentId, 'P2-WN-005', 'p2-prereq');
  }
  if (objectiveId === 'P3-FRA-003') {
    await seedMastered(learning, studentId, 'P2-FRA-003', 'p3-p2-prereq');
    await seedMastered(learning, studentId, 'P3-FRA-001', 'p3-prereq');
  }

  const plan: WeeklyPlan = {
    id: `plan-${levelId}-${objectiveId}`,
    studentId,
    weekStart: '2026-08-24',
    sessionsPerWeek: 4,
    minutesPerSession: 30,
    createdAt: CREATED,
  };
  const lesson: DailyLesson = {
    id: `lesson-${levelId}-${objectiveId}`,
    weeklyPlanId: plan.id,
    studentId,
    sequence: 1,
    intent: 'PRACTICE',
    objectiveIds: [objectiveId],
    estimatedMinutes: 30,
    rationale: [{ code: 'CURRENT_POSITION', objectiveId }],
    createdAt: CREATED,
  };
  await planning.createWeeklyPlan(plan, [lesson]);
  const service = new PracticeServiceImpl(learning, planning, practice, idFactory);
  return { studentId, lesson, learning, practice, service };
}

describe('Phase 4 practice / Attempt end-to-end', () => {
  it('P2 independent correct flows through Attempt → Evidence → derived mastery', async () => {
    const { studentId, lesson, learning, practice, service } = await harness('P2', 'P2-MD-001');
    const session = await service.createPracticeSession(lesson.id, 'P2-MD-001', '2026-08-25T01:01:00.000Z');
    const [item] = await practice.listPracticeItems(session.id);
    if (!item) throw new Error('missing generated item');

    const attempt = await service.submitAttempt({
      attemptId: 'p2-independent', sessionId: session.id, itemId: item.id, answerText: answerText(item.answerSpec),
    }, '2026-08-25T01:02:00.000Z');

    expect(attempt).toMatchObject({ outcome: 'CORRECT', hintUsed: false });
    expect(await learning.getEvidence(evidenceIdForAttempt(attempt.id))).toMatchObject({
      type: 'independent_correct', origin: { kind: 'PRACTICE', refId: attempt.id },
    });
    expect((await getObjectiveMastery(learning, studentId, 'P2-MD-001')).state).toBe('DEVELOPING');
  });

  it('hint then correct produces correct_with_hint and never independent evidence', async () => {
    const { lesson, learning, practice, service } = await harness('P2', 'P2-MD-001');
    const session = await service.createPracticeSession(lesson.id, 'P2-MD-001', '2026-08-25T01:01:00.000Z');
    const [item] = await practice.listPracticeItems(session.id);
    if (!item) throw new Error('missing generated item');
    await service.revealHint(session.id, item.id, '2026-08-25T01:02:00.000Z');
    const attempt = await service.submitAttempt({
      attemptId: 'hinted', sessionId: session.id, itemId: item.id, answerText: answerText(item.answerSpec),
    }, '2026-08-25T01:03:00.000Z');
    expect((await learning.getEvidence(evidenceIdForAttempt(attempt.id)))?.type).toBe('correct_with_hint');
  });

  it('wrong → retry → correct preserves both Attempts and projects corrected evidence', async () => {
    const { lesson, learning, practice, service } = await harness('P2', 'P2-MD-001');
    const session = await service.createPracticeSession(lesson.id, 'P2-MD-001', '2026-08-25T01:01:00.000Z');
    const [item] = await practice.listPracticeItems(session.id);
    if (!item) throw new Error('missing generated item');
    await service.submitAttempt({ attemptId: 'wrong', sessionId: session.id, itemId: item.id, answerText: '999999' }, '2026-08-25T01:02:00.000Z');
    await service.submitAttempt({
      attemptId: 'corrected', sessionId: session.id, itemId: item.id,
      answerText: answerText(item.answerSpec), retryOfAttemptId: 'wrong',
    }, '2026-08-25T01:03:00.000Z');

    expect((await practice.listAttemptsForItem(item.id)).map((attempt) => attempt.id)).toEqual(['wrong', 'corrected']);
    expect((await learning.getEvidence(evidenceIdForAttempt('wrong')))?.type).toBe('incorrect');
    expect((await learning.getEvidence(evidenceIdForAttempt('corrected')))?.type).toBe('corrected');
  });

  it('P3 application item produces application_correct', async () => {
    const { studentId, lesson, learning, practice, service } = await harness('P3', 'P3-FRA-003');
    await learning.appendEvidence({
      id: 'target-developing', studentId, objectiveId: 'P3-FRA-003', type: 'correct_with_hint',
      observedAt: '2026-08-24T02:00:00.000Z', recordedAt: '2026-08-24T02:00:00.000Z',
      origin: { kind: 'SETUP', refId: 'target-setup' },
    });
    const session = await service.createPracticeSession(lesson.id, 'P3-FRA-003', '2026-08-25T01:01:00.000Z');
    const items = await practice.listPracticeItems(session.id);
    const item = items.find((candidate) => candidate.difficultyBand === 'APPLICATION');
    if (!item) throw new Error('missing application item');
    const attempt = await service.submitAttempt({
      attemptId: 'p3-application', sessionId: session.id, itemId: item.id, answerText: answerText(item.answerSpec),
    }, '2026-08-25T01:02:00.000Z');
    expect((await learning.getEvidence(evidenceIdForAttempt(attempt.id)))?.type).toBe('application_correct');
  });

  it('exact replay repairs a missing stable Evidence record without duplicating Attempt', async () => {
    const { lesson, learning, practice, service } = await harness('P2', 'P2-MD-001');
    const session = await service.createPracticeSession(lesson.id, 'P2-MD-001', '2026-08-25T01:01:00.000Z');
    const [item] = await practice.listPracticeItems(session.id);
    if (!item) throw new Error('missing generated item');
    const answer = answerText(item.answerSpec);
    const seeded: Attempt = {
      id: 'repair-e2e', sessionId: session.id, itemId: item.id, studentId: session.studentId,
      objectiveId: session.objectiveId, answerText: answer, outcome: 'CORRECT', hintUsed: false,
      gradingPolicyVersion: 'grading-v1', submittedAt: '2026-08-25T01:02:00.000Z', recordedAt: '2026-08-25T01:02:00.000Z',
    };
    await practice.appendAttempt(seeded);
    await service.submitAttempt({ attemptId: seeded.id, sessionId: session.id, itemId: item.id, answerText: answer }, '2026-08-25T01:03:00.000Z');
    expect(await practice.listAttemptsForItem(item.id)).toHaveLength(1);
    expect(await learning.getEvidence(evidenceIdForAttempt(seeded.id))).toBeDefined();
  });

  it('unsupported P3 objective fails closed with no persisted session or AI fallback', async () => {
    const { lesson, practice, service } = await harness('P3', 'P3-MONEY-001');
    await expect(service.createPracticeSession(lesson.id, 'P3-MONEY-001', '2026-08-25T01:01:00.000Z'))
      .rejects.toThrow('Unsupported practice objective: P3-MONEY-001');
    expect(await practice.findPracticeSession(lesson.id, 'P3-MONEY-001')).toBeUndefined();
  });
});
