import type { PracticeRepository } from './repository';
import type {
  Attempt,
  PracticeHintReveal,
  PracticeItem,
  PracticeSession,
} from './types';
import {
  assertValidAttempt,
  assertValidPracticeHintReveal,
  assertValidPracticeItem,
  assertValidPracticeSession,
} from './validation';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sessionCoordinateKey(lessonId: string, objectiveId: string): string {
  return JSON.stringify([lessonId, objectiveId]);
}

function hintCoordinateKey(studentId: string, itemId: string): string {
  return JSON.stringify([studentId, itemId]);
}

function compareAttempts(left: Attempt, right: Attempt): number {
  return Date.parse(left.submittedAt) - Date.parse(right.submittedAt)
    || Date.parse(left.recordedAt) - Date.parse(right.recordedAt)
    || left.id.localeCompare(right.id);
}

function compareCorrectionAttempts(left: Attempt, right: Attempt): number {
  return Date.parse(left.submittedAt) - Date.parse(right.submittedAt)
    || left.id.localeCompare(right.id);
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

function sameAttemptSource(left: Attempt, right: Attempt): boolean {
  if (left.source.kind !== right.source.kind) return false;
  if (left.source.kind === 'PRACTICE' && right.source.kind === 'PRACTICE') {
    return left.source.sessionId === right.source.sessionId && left.source.itemId === right.source.itemId;
  }
  if (left.source.kind === 'HOMEWORK' && right.source.kind === 'HOMEWORK') {
    return left.source.submissionId === right.source.submissionId && left.source.problemId === right.source.problemId;
  }
  if (left.source.kind === 'CORRECTION' && right.source.kind === 'CORRECTION') {
    return left.source.mistakeId === right.source.mistakeId
      && left.source.correctionItemId === right.source.correctionItemId;
  }
  return false;
}

function retryCoordinatesMatch(parent: Attempt, child: Attempt): boolean {
  if (parent.studentId !== child.studentId || parent.objectiveId !== child.objectiveId) return false;
  if (child.source.kind !== 'CORRECTION') return sameAttemptSource(parent, child);
  if (parent.source.kind === 'CORRECTION') return sameAttemptSource(parent, child);
  return parent.source.kind === 'PRACTICE' || parent.source.kind === 'HOMEWORK';
}

export class MemoryPracticeRepository implements PracticeRepository {
  private readonly sessions = new Map<string, PracticeSession>();
  private readonly sessionByCoordinates = new Map<string, string>();
  private readonly items = new Map<string, PracticeItem>();
  private readonly reveals = new Map<string, PracticeHintReveal>();
  private readonly revealByCoordinates = new Map<string, string>();
  private readonly attempts = new Map<string, Attempt>();
  private readonly retryChildByParent = new Map<string, string>();

  async createPracticeSession(session: PracticeSession, items: PracticeItem[]): Promise<void> {
    assertValidPracticeSession(session);
    if (items.length === 0) throw new Error('practice session items must be non-empty');
    if (this.sessions.has(session.id)) throw new Error('practice session id already exists');

    const coordinateKey = sessionCoordinateKey(session.lessonId, session.objectiveId);
    if (this.sessionByCoordinates.has(coordinateKey)) {
      throw new Error('practice session already exists for lesson and objective');
    }

    const itemIds = new Set<string>();
    const sequences = new Set<number>();
    for (const item of items) {
      assertValidPracticeItem(item);
      if (itemIds.has(item.id) || this.items.has(item.id)) {
        throw new Error('practice item id must be unique');
      }
      if (sequences.has(item.sequence)) {
        throw new Error('practice item sequence must be unique within practice session');
      }
      if (item.sessionId !== session.id) {
        throw new Error('practice item sessionId must match practice session id');
      }
      if (item.studentId !== session.studentId) {
        throw new Error('practice item studentId must match practice session studentId');
      }
      if (item.objectiveId !== session.objectiveId) {
        throw new Error('practice item objectiveId must match practice session objectiveId');
      }
      if (Date.parse(item.createdAt) < Date.parse(session.createdAt)) {
        throw new Error('practice item createdAt must not precede practice session createdAt');
      }
      itemIds.add(item.id);
      sequences.add(item.sequence);
    }

    this.sessions.set(session.id, clone(session));
    this.sessionByCoordinates.set(coordinateKey, session.id);
    for (const item of items) this.items.set(item.id, clone(item));
  }

  async getPracticeSession(sessionId: string): Promise<PracticeSession | undefined> {
    const session = this.sessions.get(sessionId);
    return session ? clone(session) : undefined;
  }

  async findPracticeSession(lessonId: string, objectiveId: string): Promise<PracticeSession | undefined> {
    const sessionId = this.sessionByCoordinates.get(sessionCoordinateKey(lessonId, objectiveId));
    return sessionId ? this.getPracticeSession(sessionId) : undefined;
  }

  async getPracticeItem(itemId: string): Promise<PracticeItem | undefined> {
    const item = this.items.get(itemId);
    return item ? clone(item) : undefined;
  }

  async listPracticeItems(sessionId: string): Promise<PracticeItem[]> {
    return [...this.items.values()]
      .filter((item) => item.sessionId === sessionId)
      .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
      .map(clone);
  }

  async appendHintReveal(reveal: PracticeHintReveal): Promise<void> {
    assertValidPracticeHintReveal(reveal);
    if (this.reveals.has(reveal.id)) throw new Error('practice hint reveal id already exists');
    const item = this.items.get(reveal.itemId);
    if (!item) throw new Error(`Unknown practice item id: ${reveal.itemId}`);
    if (!coordinatesMatchItem(reveal, item)) {
      throw new Error('practice hint reveal coordinates must match practice item');
    }
    const coordinateKey = hintCoordinateKey(reveal.studentId, reveal.itemId);
    if (this.revealByCoordinates.has(coordinateKey)) {
      throw new Error('practice hint already revealed for student and item');
    }
    if (Date.parse(reveal.revealedAt) < Date.parse(item.createdAt)) {
      throw new Error('practice hint reveal must not precede practice item creation');
    }
    this.reveals.set(reveal.id, clone(reveal));
    this.revealByCoordinates.set(coordinateKey, reveal.id);
  }

  async listHintReveals(itemId: string): Promise<PracticeHintReveal[]> {
    return [...this.reveals.values()]
      .filter((reveal) => reveal.itemId === itemId)
      .sort((left, right) => Date.parse(left.revealedAt) - Date.parse(right.revealedAt) || left.id.localeCompare(right.id))
      .map(clone);
  }

  async getAttempt(attemptId: string): Promise<Attempt | undefined> {
    const attempt = this.attempts.get(attemptId);
    return attempt ? clone(attempt) : undefined;
  }

  async appendAttempt(attempt: Attempt): Promise<void> {
    assertValidAttempt(attempt);
    if (this.attempts.has(attempt.id)) throw new Error('attempt id already exists');

    if (attempt.source.kind === 'PRACTICE') {
      const item = this.items.get(attempt.source.itemId);
      if (!item) throw new Error(`Unknown practice item id: ${attempt.source.itemId}`);
      if (!attemptCoordinatesMatchItem(attempt, item)) {
        throw new Error('attempt coordinates must match practice item');
      }
      if (Date.parse(attempt.submittedAt) < Date.parse(item.createdAt)) {
        throw new Error('attempt submittedAt must not precede practice item createdAt');
      }
    }

    if (attempt.retryOfAttemptId) {
      const parent = this.attempts.get(attempt.retryOfAttemptId);
      if (!parent) throw new Error('retry parent does not exist');
      if (!retryCoordinatesMatch(parent, attempt)) {
        throw new Error('retry parent coordinates must match attempt');
      }
      if (this.retryChildByParent.has(attempt.retryOfAttemptId)) {
        throw new Error('retry parent already has a retry child');
      }
    }
    this.attempts.set(attempt.id, clone(attempt));
    if (attempt.retryOfAttemptId) this.retryChildByParent.set(attempt.retryOfAttemptId, attempt.id);
  }

  async listAttemptsForItem(itemId: string): Promise<Attempt[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.source.kind === 'PRACTICE' && attempt.source.itemId === itemId)
      .sort(compareAttempts)
      .map(clone);
  }

  async listAttemptsForSession(sessionId: string): Promise<Attempt[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.source.kind === 'PRACTICE' && attempt.source.sessionId === sessionId)
      .sort(compareAttempts)
      .map(clone);
  }

  async listAttemptsForStudent(studentId: string): Promise<Attempt[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.studentId === studentId)
      .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt) || left.id.localeCompare(right.id))
      .map(clone);
  }

  async listAttemptsForCorrectionItem(correctionItemId: string): Promise<Attempt[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.source.kind === 'CORRECTION' && attempt.source.correctionItemId === correctionItemId)
      .sort(compareCorrectionAttempts)
      .map(clone);
  }
}
