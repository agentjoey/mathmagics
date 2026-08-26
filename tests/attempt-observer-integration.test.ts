import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { HomeworkServiceImpl, MemoryHomeworkRepository } from '@/lib/homework';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPlanningRepository, type DailyLesson, type WeeklyPlan } from '@/lib/planning';
import {
  MemoryPracticeRepository,
  PracticeServiceImpl,
  evidenceIdForAttempt,
  type Attempt,
  type AttemptRecordedObserver,
  type PracticeIdFactory,
} from '@/lib/practice';
import type { HomeworkVisionInput, HomeworkVisionProvider } from '@/lib/providers/homework-vision';

const now = '2026-08-25T14:00:00.000Z';

class DurableObserver implements AttemptRecordedObserver {
  readonly calls: Attempt[] = [];

  constructor(
    private readonly practice: MemoryPracticeRepository,
    private readonly learning: MemoryLearningStateRepository,
  ) {}

  async onAttemptRecorded(attempt: Attempt): Promise<void> {
    expect(await this.practice.getAttempt(attempt.id)).toEqual(attempt);
    const evidence = await this.learning.listEvidenceForObjective(attempt.studentId, attempt.objectiveId);
    expect(evidence.some((record) => record.origin.refId === attempt.id)).toBe(true);
    this.calls.push(structuredClone(attempt));
  }
}

const idFactory: PracticeIdFactory = {
  sessionId: (lessonId, objectiveId) => `session:${lessonId}:${objectiveId}`,
  itemId: (sessionId, sequence) => `${sessionId}:item:${sequence}`,
};

async function practiceFixture() {
  const learning = new MemoryLearningStateRepository();
  const planning = new MemoryPlanningRepository();
  const practice = new MemoryPracticeRepository();
  await learning.saveStudent({
    id: 's1', displayName: 'Alex', levelId: 'P2', learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4, minutesPerSession: 30, createdAt: now, updatedAt: now,
  });
  for (let index = 1; index <= 3; index += 1) {
    await learning.appendEvidence({
      id: `pre-${index}`, studentId: 's1', objectiveId: 'P2-WN-005',
      type: index === 3 ? 'application_correct' : 'independent_correct',
      observedAt: `2026-08-25T13:0${index}:00.000Z`, recordedAt: `2026-08-25T13:0${index}:00.000Z`,
      origin: { kind: 'SETUP', refId: `setup-${index}` },
    });
  }
  const plan: WeeklyPlan = {
    id: 'plan-obs', studentId: 's1', weekStart: '2026-08-24', sessionsPerWeek: 4,
    minutesPerSession: 30, createdAt: now,
  };
  const lesson: DailyLesson = {
    id: 'lesson-obs', weeklyPlanId: plan.id, studentId: 's1', sequence: 1, intent: 'PRACTICE',
    objectiveIds: ['P2-MD-001'], estimatedMinutes: 30,
    rationale: [{ code: 'CURRENT_POSITION', objectiveId: 'P2-MD-001' }], createdAt: now,
  };
  await planning.createWeeklyPlan(plan, [lesson]);
  const observer = new DurableObserver(practice, learning);
  const service = new PracticeServiceImpl(learning, planning, practice, idFactory, observer);
  const session = await service.createPracticeSession(lesson.id, 'P2-MD-001', now);
  const items = await practice.listPracticeItems(session.id);
  return { learning, practice, observer, service, session, items };
}

function homeworkProvider(answer: string): HomeworkVisionProvider {
  return {
    async extract(input: HomeworkVisionInput) {
      const region = { x: 0, y: 0, width: 0.2, height: 0.1 };
      const field = (value: string) => ({ value, confidence: 0.99, region });
      return {
        submissionId: input.submissionId,
        studentId: input.studentId,
        provider: 'fixture',
        model: 'fixture-v1',
        schemaVersion: 'homework-vision-v1' as const,
        problems: [{
          id: `${input.submissionId}:problem:1`, submissionId: input.submissionId, studentId: input.studentId, sequence: 1,
          question: field('3 × 4'), answer: field(answer),
          structured: { family: 'ARITHMETIC', fields: { operation: field('MULTIPLY'), left: field('3'), right: field('4') } },
          provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1' as const, createdAt: input.now,
        }],
      };
    },
  };
}

async function homeworkFixture(answer: string) {
  const homework = new MemoryHomeworkRepository();
  const practice = new MemoryPracticeRepository();
  const learning = new MemoryLearningStateRepository();
  await learning.saveStudent({
    id: 's1', displayName: 'Alex', levelId: 'P2', learningMode: 'STRUCTURED_HOME_LEARNING',
    sessionsPerWeek: 4, minutesPerSession: 30, createdAt: now, updatedAt: now,
  });
  const observer = new DurableObserver(practice, learning);
  const service = new HomeworkServiceImpl(homework, practice, learning, homeworkProvider(answer), observer);
  const bytes = new Uint8Array([2, 4, 6]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await service.submitHomework({ submissionId: `homework-${answer}`, studentId: 's1', bytes, mimeType: 'image/png', sha256 }, now);
  return { service, observer };
}

describe('post-Attempt observer integration', () => {
  test('does not notify for correct Practice Attempt and notifies once after durable facts for incorrect Practice Attempt', async () => {
    const { service, observer, session, items } = await practiceFixture();
    const correctItem = items[0]!;
    const wrongItem = items[1]!;
    if (correctItem.answerSpec.kind !== 'INTEGER') throw new Error('fixture mismatch');

    await service.submitAttempt({
      attemptId: 'practice-correct', sessionId: session.id, itemId: correctItem.id, answerText: correctItem.answerSpec.value,
    }, '2026-08-25T14:01:00.000Z');
    expect(observer.calls).toHaveLength(0);

    const wrong = await service.submitAttempt({
      attemptId: 'practice-wrong', sessionId: session.id, itemId: wrongItem.id, answerText: '999',
    }, '2026-08-25T14:02:00.000Z');
    expect(wrong.outcome).toBe('INCORRECT');
    expect(observer.calls.map((attempt) => attempt.id)).toEqual(['practice-wrong']);
  });

  test('does not notify for correct Homework Attempt and notifies after durable facts for incorrect Homework Attempt', async () => {
    const correct = await homeworkFixture('12');
    await correct.service.gradeHomeworkProblem({ problemId: 'homework-12:problem:1', attemptId: 'homework-correct' }, '2026-08-25T14:03:00.000Z');
    expect(correct.observer.calls).toHaveLength(0);

    const wrong = await homeworkFixture('11');
    const result = await wrong.service.gradeHomeworkProblem({ problemId: 'homework-11:problem:1', attemptId: 'homework-wrong' }, '2026-08-25T14:04:00.000Z');
    expect(result.attempt.outcome).toBe('INCORRECT');
    expect(wrong.observer.calls.map((attempt) => attempt.id)).toEqual(['homework-wrong']);
  });

  test('observer does not change canonical Evidence authority', async () => {
    const { learning, service, session, items } = await practiceFixture();
    const item = items[0]!;
    await service.submitAttempt({ attemptId: 'practice-observed-wrong', sessionId: session.id, itemId: item.id, answerText: '999' }, '2026-08-25T14:05:00.000Z');
    expect(await learning.getEvidence(evidenceIdForAttempt('practice-observed-wrong'))).toMatchObject({
      type: 'incorrect', origin: { kind: 'PRACTICE', refId: 'practice-observed-wrong' },
    });
  });
});
