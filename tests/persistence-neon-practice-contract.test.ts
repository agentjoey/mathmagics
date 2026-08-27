import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonPracticeRepository } from '@/lib/persistence/neon-practice-repository';
import { dailyLessons, students, weeklyPlans } from '@/lib/persistence/schema';
import type { PracticeItem, PracticeSession } from '@/lib/practice';

const describeLive = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeLive('NeonPracticeRepository live contract', () => {
  it('constructs only from the explicit TEST_DATABASE_URL and exposes the practice repository surface', () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const repository = new NeonPracticeRepository(createNeonDatabase(databaseUrl));
    expect(repository.createPracticeSession).toBeTypeOf('function');
    expect(repository.appendHintReveal).toBeTypeOf('function');
    expect(repository.appendAttempt).toBeTypeOf('function');
  });

  it('round-trips a self-contained practice session/items fixture on a migrated test database', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const db = createNeonDatabase(databaseUrl);
    const repository = new NeonPracticeRepository(db);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const studentId = `phase4-contract-student-${suffix}`;
    const planId = `phase4-contract-plan-${suffix}`;
    const lessonId = `phase4-contract-lesson-${suffix}`;
    const createdAt = new Date().toISOString();

    const session: PracticeSession = {
      id: `phase4-contract-session-${suffix}`,
      studentId,
      lessonId,
      objectiveId: 'P2-MD-001',
      policyVersion: 'practice-v1',
      createdAt,
    };
    const item: PracticeItem = {
      id: `phase4-contract-item-${suffix}`,
      sessionId: session.id,
      studentId,
      objectiveId: session.objectiveId,
      sequence: 1,
      difficultyBand: 'CORE',
      problemSpec: { kind: 'ARITHMETIC', operation: 'MULTIPLY', left: 2, right: 3 },
      prompt: 'What is 2 × 3?',
      answerSpec: { kind: 'INTEGER', value: '6' },
      solutionOutline: ['2 × 3 = 6'],
      generator: 'contract',
      generatorVersion: '1',
      createdAt,
    };

    try {
      await db.insert(students).values({
        id: studentId,
        displayName: 'Phase 4 Contract Student',
        levelId: 'P2',
        learningMode: 'STRUCTURED_HOME_LEARNING',
        sessionsPerWeek: 1,
        minutesPerSession: 30,
        createdAt,
        updatedAt: createdAt,
      });
      await db.insert(weeklyPlans).values({
        id: planId,
        studentId,
        weekStart: '2026-08-24',
        sessionsPerWeek: 1,
        minutesPerSession: 30,
        createdAt,
      });
      await db.insert(dailyLessons).values({
        id: lessonId,
        weeklyPlanId: planId,
        studentId,
        sequence: 1,
        intent: 'PRACTICE',
        objectiveIds: [session.objectiveId],
        estimatedMinutes: 30,
        rationale: [{ code: 'CURRENT_POSITION', objectiveId: session.objectiveId }],
        createdAt,
      });

      await repository.createPracticeSession(session, [item]);
      expect(await repository.getPracticeSession(session.id)).toEqual(session);
      expect(await repository.listPracticeItems(session.id)).toEqual([item]);
    } finally {
      await db.delete(students).where(eq(students.id, studentId));
    }
  });
});
