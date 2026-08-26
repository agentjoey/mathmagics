import type {
  Attempt,
  PracticeHintReveal,
  PracticeItem,
  PracticeSession,
} from './types';

export interface PracticeRepository {
  createPracticeSession(session: PracticeSession, items: PracticeItem[]): Promise<void>;
  getPracticeSession(sessionId: string): Promise<PracticeSession | undefined>;
  findPracticeSession(lessonId: string, objectiveId: string): Promise<PracticeSession | undefined>;
  getPracticeItem(itemId: string): Promise<PracticeItem | undefined>;
  listPracticeItems(sessionId: string): Promise<PracticeItem[]>;
  appendHintReveal(reveal: PracticeHintReveal): Promise<void>;
  listHintReveals(itemId: string): Promise<PracticeHintReveal[]>;
  getAttempt(attemptId: string): Promise<Attempt | undefined>;
  appendAttempt(attempt: Attempt): Promise<void>;
  listAttemptsForItem(itemId: string): Promise<Attempt[]>;
  listAttemptsForSession(sessionId: string): Promise<Attempt[]>;
  listAttemptsForStudent(studentId: string): Promise<Attempt[]>;
  listAttemptsForCorrectionItem(correctionItemId: string): Promise<Attempt[]>;
}
