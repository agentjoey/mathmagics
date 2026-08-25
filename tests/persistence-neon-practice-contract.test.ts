import { describe, expect, it } from 'vitest';
import { createNeonDatabase } from '@/lib/persistence/db';
import { NeonPracticeRepository } from '@/lib/persistence/neon-practice-repository';
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

  it('round-trips a practice session/items when the test database is already migrated and seeded', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const repository = new NeonPracticeRepository(createNeonDatabase(databaseUrl));
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const studentId = `phase4-contract-student-${suffix}`;
    const lessonId = `phase4-contract-lesson-${suffix}`;

    // This contract deliberately assumes the caller prepared an isolated migrated test DB
    // and seeded matching students/daily_lessons rows. It never auto-migrates or falls back
    // to DATABASE_URL. The full seed path is exercised only in a dedicated activation run.
    const session: PracticeSession = {
      id: `phase4-contract-session-${suffix}`,
      studentId,
      lessonId,
      objectiveId: 'P2-MD-001',
      policyVersion: 'practice-v1',
      createdAt: new Date().toISOString(),
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
      createdAt: session.createdAt,
    };

    // FK seeding is intentionally external to this repository contract. If TEST_DATABASE_URL
    // is supplied without matching seed rows, this test fails rather than silently touching prod.
    await repository.createPracticeSession(session, [item]);
    expect(await repository.getPracticeSession(session.id)).toEqual(session);
    expect(await repository.listPracticeItems(session.id)).toEqual([item]);
  });
});
