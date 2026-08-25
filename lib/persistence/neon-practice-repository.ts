import { and, asc, eq } from 'drizzle-orm';
import type { DifficultyBand } from '@/lib/curriculum';
import type {
  AnswerSpec,
  Attempt,
  AttemptOutcome,
  PracticeHintReveal,
  PracticeItem,
  PracticeProblemSpec,
  PracticeRepository,
  PracticeSession,
} from '@/lib/practice';
import {
  assertValidAttempt,
  assertValidPracticeHintReveal,
  assertValidPracticeItem,
  assertValidPracticeSession,
} from '@/lib/practice';
import { createNeonDatabase } from './db';
import type { MathMagicsDatabase } from './db';
import {
  attempts,
  practiceHintReveals,
  practiceItems,
  practiceSessions,
} from './schema';

function toSession(row: typeof practiceSessions.$inferSelect): PracticeSession {
  const session: PracticeSession = {
    id: row.id,
    studentId: row.studentId,
    lessonId: row.lessonId,
    objectiveId: row.objectiveId,
    policyVersion: row.policyVersion,
    createdAt: row.createdAt,
  };
  assertValidPracticeSession(session);
  return session;
}

function toItem(row: typeof practiceItems.$inferSelect): PracticeItem {
  const item: PracticeItem = {
    id: row.id,
    sessionId: row.sessionId,
    studentId: row.studentId,
    objectiveId: row.objectiveId,
    sequence: row.sequence,
    difficultyBand: row.difficultyBand as DifficultyBand,
    problemSpec: structuredClone(row.problemSpec as PracticeProblemSpec),
    prompt: row.prompt,
    answerSpec: structuredClone(row.answerSpec as AnswerSpec),
    hint: row.hint ?? undefined,
    solutionOutline: structuredClone(row.solutionOutline),
    generator: row.generator,
    generatorVersion: row.generatorVersion,
    createdAt: row.createdAt,
  };
  assertValidPracticeItem(item);
  return item;
}

function toReveal(row: typeof practiceHintReveals.$inferSelect): PracticeHintReveal {
  const reveal: PracticeHintReveal = {
    id: row.id,
    sessionId: row.sessionId,
    itemId: row.itemId,
    studentId: row.studentId,
    revealedAt: row.revealedAt,
  };
  assertValidPracticeHintReveal(reveal);
  return reveal;
}

function toAttempt(row: typeof attempts.$inferSelect): Attempt {
  const attempt: Attempt = {
    id: row.id,
    source: { kind: 'PRACTICE', sessionId: row.sessionId, itemId: row.itemId },
    studentId: row.studentId,
    objectiveId: row.objectiveId,
    answerText: row.answerText,
    outcome: row.outcome as AttemptOutcome,
    hintUsed: row.hintUsed,
    retryOfAttemptId: row.retryOfAttemptId ?? undefined,
    gradingPolicyVersion: row.gradingPolicyVersion,
    submittedAt: row.submittedAt,
    recordedAt: row.recordedAt,
  };
  assertValidAttempt(attempt);
  return attempt;
}

function coordinatesMatchItem(
  record: { sessionId: string; itemId: string; studentId: string; objectiveId?: string },
  item: PracticeItem,
): boolean {
  return record.sessionId === item.sessionId
    && record.itemId === item.id
    && record.studentId === item.studentId
    && (record.objectiveId === undefined || record.objectiveId === item.objectiveId);
}

function attemptCoordinatesMatchItem(attempt: Attempt, item: PracticeItem): boolean {
  return attempt.source.kind === 'PRACTICE'
    && attempt.source.sessionId === item.sessionId
    && attempt.source.itemId === item.id
    && attempt.studentId === item.studentId
    && attempt.objectiveId === item.objectiveId;
}

export class NeonPracticeRepository implements PracticeRepository {
  constructor(private readonly db: MathMagicsDatabase = createNeonDatabase()) {}

  async createPracticeSession(session: PracticeSession, items: PracticeItem[]): Promise<void> {
    assertValidPracticeSession(session);
    if (items.length === 0) throw new Error('practice session items must be non-empty');
    const [sameId] = await this.db.select({ id: practiceSessions.id }).from(practiceSessions)
      .where(eq(practiceSessions.id, session.id)).limit(1);
    if (sameId) throw new Error('practice session id already exists');
    const existingCoordinates = await this.findPracticeSession(session.lessonId, session.objectiveId);
    if (existingCoordinates) throw new Error('practice session already exists for lesson and objective');

    const ids = new Set<string>();
    const sequences = new Set<number>();
    for (const item of items) {
      assertValidPracticeItem(item);
      if (ids.has(item.id)) throw new Error('practice item id must be unique');
      if (sequences.has(item.sequence)) throw new Error('practice item sequence must be unique within practice session');
      if (item.sessionId !== session.id) throw new Error('practice item sessionId must match practice session id');
      if (item.studentId !== session.studentId) throw new Error('practice item studentId must match practice session studentId');
      if (item.objectiveId !== session.objectiveId) throw new Error('practice item objectiveId must match practice session objectiveId');
      if (Date.parse(item.createdAt) < Date.parse(session.createdAt)) {
        throw new Error('practice item createdAt must not precede practice session createdAt');
      }
      const [existingItem] = await this.db.select({ id: practiceItems.id }).from(practiceItems)
        .where(eq(practiceItems.id, item.id)).limit(1);
      if (existingItem) throw new Error('practice item id must be unique');
      ids.add(item.id);
      sequences.add(item.sequence);
    }

    const sessionInsert = this.db.insert(practiceSessions).values({
      id: session.id,
      studentId: session.studentId,
      lessonId: session.lessonId,
      objectiveId: session.objectiveId,
      policyVersion: session.policyVersion,
      createdAt: session.createdAt,
    });
    const itemInsert = this.db.insert(practiceItems).values(items.map((item) => ({
      id: item.id,
      sessionId: item.sessionId,
      studentId: item.studentId,
      objectiveId: item.objectiveId,
      sequence: item.sequence,
      difficultyBand: item.difficultyBand,
      problemSpec: item.problemSpec,
      prompt: item.prompt,
      answerSpec: item.answerSpec,
      hint: item.hint,
      solutionOutline: item.solutionOutline,
      generator: item.generator,
      generatorVersion: item.generatorVersion,
      createdAt: item.createdAt,
    })));
    await this.db.batch([sessionInsert, itemInsert]);
  }

  async getPracticeSession(sessionId: string): Promise<PracticeSession | undefined> {
    const [row] = await this.db.select().from(practiceSessions)
      .where(eq(practiceSessions.id, sessionId)).limit(1);
    return row ? toSession(row) : undefined;
  }

  async findPracticeSession(lessonId: string, objectiveId: string): Promise<PracticeSession | undefined> {
    const [row] = await this.db.select().from(practiceSessions)
      .where(and(eq(practiceSessions.lessonId, lessonId), eq(practiceSessions.objectiveId, objectiveId)))
      .limit(1);
    return row ? toSession(row) : undefined;
  }

  async getPracticeItem(itemId: string): Promise<PracticeItem | undefined> {
    const [row] = await this.db.select().from(practiceItems)
      .where(eq(practiceItems.id, itemId)).limit(1);
    return row ? toItem(row) : undefined;
  }

  async listPracticeItems(sessionId: string): Promise<PracticeItem[]> {
    const rows = await this.db.select().from(practiceItems)
      .where(eq(practiceItems.sessionId, sessionId))
      .orderBy(asc(practiceItems.sequence), asc(practiceItems.id));
    return rows.map(toItem);
  }

  async appendHintReveal(reveal: PracticeHintReveal): Promise<void> {
    assertValidPracticeHintReveal(reveal);
    const [sameId] = await this.db.select({ id: practiceHintReveals.id }).from(practiceHintReveals)
      .where(eq(practiceHintReveals.id, reveal.id)).limit(1);
    if (sameId) throw new Error('practice hint reveal id already exists');
    const item = await this.getPracticeItem(reveal.itemId);
    if (!item) throw new Error(`Unknown practice item id: ${reveal.itemId}`);
    if (!coordinatesMatchItem(reveal, item)) throw new Error('practice hint reveal coordinates must match practice item');
    if (Date.parse(reveal.revealedAt) < Date.parse(item.createdAt)) {
      throw new Error('practice hint reveal revealedAt must not precede practice item createdAt');
    }
    const [existingCoordinates] = await this.db.select({ id: practiceHintReveals.id }).from(practiceHintReveals)
      .where(and(
        eq(practiceHintReveals.studentId, reveal.studentId),
        eq(practiceHintReveals.itemId, reveal.itemId),
      )).limit(1);
    if (existingCoordinates) throw new Error('practice hint already revealed for student and item');
    await this.db.insert(practiceHintReveals).values(reveal);
  }

  async listHintReveals(itemId: string): Promise<PracticeHintReveal[]> {
    const rows = await this.db.select().from(practiceHintReveals)
      .where(eq(practiceHintReveals.itemId, itemId))
      .orderBy(asc(practiceHintReveals.revealedAt), asc(practiceHintReveals.id));
    return rows.map(toReveal);
  }

  async getAttempt(attemptId: string): Promise<Attempt | undefined> {
    const [row] = await this.db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
    return row ? toAttempt(row) : undefined;
  }

  async appendAttempt(attempt: Attempt): Promise<void> {
    assertValidAttempt(attempt);
    if (attempt.source.kind !== 'PRACTICE') {
      throw new Error('legacy Neon attempt schema supports PRACTICE source only until Phase 5 migration');
    }
    const [sameId] = await this.db.select({ id: attempts.id }).from(attempts)
      .where(eq(attempts.id, attempt.id)).limit(1);
    if (sameId) throw new Error('attempt id already exists');
    const item = await this.getPracticeItem(attempt.source.itemId);
    if (!item) throw new Error(`Unknown practice item id: ${attempt.source.itemId}`);
    if (!attemptCoordinatesMatchItem(attempt, item)) throw new Error('attempt coordinates must match practice item');
    if (Date.parse(attempt.submittedAt) < Date.parse(item.createdAt)) {
      throw new Error('attempt submittedAt must not precede practice item createdAt');
    }
    if (attempt.retryOfAttemptId) {
      const parent = await this.getAttempt(attempt.retryOfAttemptId);
      if (!parent) throw new Error('retry parent does not exist');
      const [existingChild] = await this.db.select({ id: attempts.id }).from(attempts)
        .where(eq(attempts.retryOfAttemptId, attempt.retryOfAttemptId)).limit(1);
      if (existingChild) throw new Error('retry parent already has a retry child');
    }
    await this.db.insert(attempts).values({
      id: attempt.id,
      sessionId: attempt.source.sessionId,
      itemId: attempt.source.itemId,
      studentId: attempt.studentId,
      objectiveId: attempt.objectiveId,
      answerText: attempt.answerText,
      outcome: attempt.outcome,
      hintUsed: attempt.hintUsed,
      retryOfAttemptId: attempt.retryOfAttemptId,
      gradingPolicyVersion: attempt.gradingPolicyVersion,
      submittedAt: attempt.submittedAt,
      recordedAt: attempt.recordedAt,
    });
  }

  async listAttemptsForItem(itemId: string): Promise<Attempt[]> {
    const rows = await this.db.select().from(attempts)
      .where(eq(attempts.itemId, itemId))
      .orderBy(asc(attempts.submittedAt), asc(attempts.recordedAt), asc(attempts.id));
    return rows.map(toAttempt);
  }

  async listAttemptsForSession(sessionId: string): Promise<Attempt[]> {
    const rows = await this.db.select().from(attempts)
      .where(eq(attempts.sessionId, sessionId))
      .orderBy(asc(attempts.submittedAt), asc(attempts.recordedAt), asc(attempts.id));
    return rows.map(toAttempt);
  }
}
