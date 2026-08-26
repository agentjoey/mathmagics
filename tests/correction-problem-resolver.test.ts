import { describe, expect, test } from 'vitest';
import { RepositoryAttemptProblemResolver } from '@/lib/correction';
import { MemoryHomeworkRepository } from '@/lib/homework';
import { MemoryLearningStateRepository } from '@/lib/learning';
import { MemoryPracticeRepository, type Attempt, type PracticeItem, type PracticeSession } from '@/lib/practice';

const now = '2026-08-25T12:00:00.000Z';
const region = { x: 0, y: 0, width: 0.2, height: 0.1 };
const field = (value: string, confidence = 0.99) => ({ value, confidence, region });

async function repositories() {
  const practice = new MemoryPracticeRepository();
  const homework = new MemoryHomeworkRepository();
  const learning = new MemoryLearningStateRepository();
  await learning.saveStudent({
    id: 'student-1', displayName: 'Alex', levelId: 'P2',
    learningMode: 'STRUCTURED_HOME_LEARNING', sessionsPerWeek: 4, minutesPerSession: 30,
    createdAt: now, updatedAt: now,
  });
  return { practice, homework, learning };
}

function practiceFacts(): { session: PracticeSession; item: PracticeItem; attempt: Attempt } {
  const session: PracticeSession = {
    id: 'session-1', studentId: 'student-1', lessonId: 'lesson-1', objectiveId: 'P2-MD-001',
    policyVersion: 'practice-v1', createdAt: now,
  };
  const item: PracticeItem = {
    id: 'item-1', sessionId: session.id, studentId: session.studentId, objectiveId: session.objectiveId,
    sequence: 1, difficultyBand: 'CORE',
    problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
    prompt: 'What is 3 × 4?', answerSpec: { kind: 'INTEGER', value: '12' },
    hint: 'Think of three groups of four.', solutionOutline: ['3 × 4 = 12'],
    generator: 'fixture', generatorVersion: 'fixture-v1', createdAt: now,
  };
  const attempt: Attempt = {
    id: 'attempt-practice', source: { kind: 'PRACTICE', sessionId: session.id, itemId: item.id },
    studentId: session.studentId, objectiveId: session.objectiveId, answerText: '10', outcome: 'INCORRECT',
    hintUsed: false, gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
  };
  return { session, item, attempt };
}

async function addHomework(homework: MemoryHomeworkRepository, confidence = 0.99) {
  await homework.createSubmission({
    id: 'homework-1', studentId: 'student-1', sourceSha256: 'a'.repeat(64), mimeType: 'image/png',
    byteLength: 3, provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1', createdAt: now,
  }, [{
    id: 'problem-1', submissionId: 'homework-1', studentId: 'student-1', sequence: 1,
    question: field('3 × 4'), answer: field('10', confidence),
    structured: {
      family: 'ARITHMETIC',
      fields: { operation: field('MULTIPLY'), left: field('3'), right: field('4') },
    },
    provider: 'fixture', model: 'fixture-v1', schemaVersion: 'homework-vision-v1', createdAt: now,
  }]);
}

describe('RepositoryAttemptProblemResolver', () => {
  test('resolves PRACTICE truth from immutable PracticeItem and validates coordinates', async () => {
    const { practice, homework, learning } = await repositories();
    const { session, item, attempt } = practiceFacts();
    await practice.createPracticeSession(session, [item]);
    const resolver = new RepositoryAttemptProblemResolver(practice, homework, learning);

    await expect(resolver.resolve(attempt)).resolves.toMatchObject({
      attempt,
      problemSpec: item.problemSpec,
      answerSpec: item.answerSpec,
      prompt: item.prompt,
      hint: item.hint,
      solutionOutline: item.solutionOutline,
      classification: item.difficultyBand,
    });

    await expect(resolver.resolve({
      ...attempt,
      source: { kind: 'PRACTICE', sessionId: 'session-wrong', itemId: item.id },
    })).rejects.toThrow('practice attempt coordinates do not match trusted item');
  });

  test('reconstructs HOMEWORK truth through confirmations, conversion, and objective mapping', async () => {
    const { practice, homework, learning } = await repositories();
    await addHomework(homework);
    const resolver = new RepositoryAttemptProblemResolver(practice, homework, learning);
    const attempt: Attempt = {
      id: 'attempt-homework', source: { kind: 'HOMEWORK', submissionId: 'homework-1', problemId: 'problem-1' },
      studentId: 'student-1', objectiveId: 'P2-MD-001', answerText: '10', outcome: 'INCORRECT', hintUsed: false,
      gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
    };

    await expect(resolver.resolve(attempt)).resolves.toMatchObject({
      problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 3, right: 4 },
      answerSpec: { kind: 'INTEGER', value: '12' },
      prompt: '3 × 4',
      classification: 'CORE',
    });
  });

  test('fails closed for low-confidence/unconfirmed HOMEWORK and objective drift', async () => {
    const { practice, homework, learning } = await repositories();
    await addHomework(homework, 0.97);
    const resolver = new RepositoryAttemptProblemResolver(practice, homework, learning);
    const attempt: Attempt = {
      id: 'attempt-low', source: { kind: 'HOMEWORK', submissionId: 'homework-1', problemId: 'problem-1' },
      studentId: 'student-1', objectiveId: 'P2-MD-001', answerText: '10', outcome: 'INCORRECT', hintUsed: false,
      gradingPolicyVersion: 'grading-v1', submittedAt: now, recordedAt: now,
    };
    await expect(resolver.resolve(attempt)).rejects.toThrow('homework problem is not confirmed for correction');

    await homework.appendConfirmation({
      id: 'confirmation-1', problemId: 'problem-1', studentId: 'student-1', corrections: { answer: '10' },
      confirmerRole: 'PARENT', policyVersion: 'homework-confidence-v1', confirmedAt: '2026-08-25T12:01:00.000Z',
    });
    await expect(resolver.resolve({ ...attempt, objectiveId: 'P2-MD-004' }))
      .rejects.toThrow('homework attempt objective does not match trusted mapping');
  });
});
