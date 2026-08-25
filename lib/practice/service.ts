import type { EvidenceRecord, LearningStateRepository } from '@/lib/learning';
import type { PlanningRepository } from '@/lib/planning';
import { derivePracticeBlueprint } from './blueprint';
import { evidenceIdForAttempt, projectAttemptToEvidence } from './evidence';
import { gradeAnswer } from './grading';
import { getPracticeItemGenerator } from './generators/registry';
import { hintRevealId, validateRetryAttempt } from './hints';
import { buildPracticePreparationContext } from './preparation';
import type { PracticePreparationContext } from './preparation';
import type { PracticeRepository } from './repository';
import type { Attempt, PracticeHintReveal, PracticeSession, SubmitAttemptInput } from './types';

export interface PracticeIdFactory {
  sessionId(lessonId: string, objectiveId: string): string;
  itemId(sessionId: string, sequence: number): string;
}

export interface PracticeService {
  preparePractice(lessonId: string, objectiveId: string, now: string): Promise<PracticePreparationContext>;
  createPracticeSession(lessonId: string, objectiveId: string, now: string): Promise<PracticeSession>;
  revealHint(sessionId: string, itemId: string, now: string): Promise<string>;
  submitAttempt(input: SubmitAttemptInput, now: string): Promise<Attempt>;
}

function requireTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid ISO date-time string`);
}

function sameEvidence(left: EvidenceRecord, right: EvidenceRecord): boolean {
  return left.id === right.id
    && left.studentId === right.studentId
    && left.objectiveId === right.objectiveId
    && left.type === right.type
    && left.observedAt === right.observedAt
    && left.recordedAt === right.recordedAt
    && left.origin.kind === right.origin.kind
    && left.origin.refId === right.origin.refId;
}

function matchesCommand(attempt: Attempt, input: SubmitAttemptInput): boolean {
  return attempt.sessionId === input.sessionId
    && attempt.itemId === input.itemId
    && attempt.answerText === input.answerText
    && attempt.retryOfAttemptId === input.retryOfAttemptId;
}

export class PracticeServiceImpl implements PracticeService {
  constructor(
    private readonly learningRepository: LearningStateRepository,
    private readonly planningRepository: PlanningRepository,
    private readonly practiceRepository: PracticeRepository,
    private readonly idFactory: PracticeIdFactory,
  ) {}

  preparePractice(lessonId: string, objectiveId: string, now: string): Promise<PracticePreparationContext> {
    return buildPracticePreparationContext(
      this.learningRepository,
      this.planningRepository,
      lessonId,
      objectiveId,
      now,
    );
  }

  async createPracticeSession(lessonId: string, objectiveId: string, now: string): Promise<PracticeSession> {
    const existing = await this.practiceRepository.findPracticeSession(lessonId, objectiveId);
    if (existing) return existing;

    const context = await this.preparePractice(lessonId, objectiveId, now);
    const blueprint = derivePracticeBlueprint(objectiveId, context.mastery);
    const session: PracticeSession = {
      id: this.idFactory.sessionId(lessonId, objectiveId),
      studentId: context.student.id,
      lessonId,
      objectiveId,
      policyVersion: blueprint.policyVersion,
      createdAt: now,
    };
    const itemIds = blueprint.slots.map((_, index) => this.idFactory.itemId(session.id, index + 1));
    const generator = getPracticeItemGenerator(objectiveId);
    const items = generator.generate({ session, context, blueprint, itemIds });

    try {
      await this.practiceRepository.createPracticeSession(session, items);
      return session;
    } catch (error) {
      const concurrent = await this.practiceRepository.findPracticeSession(lessonId, objectiveId);
      if (concurrent) return concurrent;
      throw error;
    }
  }

  async revealHint(sessionId: string, itemId: string, now: string): Promise<string> {
    requireTimestamp(now, 'hint reveal time');
    const session = await this.practiceRepository.getPracticeSession(sessionId);
    if (!session) throw new Error(`Unknown practice session id: ${sessionId}`);
    const item = await this.practiceRepository.getPracticeItem(itemId);
    if (!item) throw new Error(`Unknown practice item id: ${itemId}`);
    if (item.sessionId !== session.id || item.studentId !== session.studentId || item.objectiveId !== session.objectiveId) {
      throw new Error('practice hint coordinates must match session and item');
    }
    if (!item.hint) throw new Error('practice item has no hint');
    if (Date.parse(now) < Date.parse(item.createdAt)) throw new Error('hint reveal cannot predate practice item creation');

    const reveal: PracticeHintReveal = {
      id: hintRevealId(session.studentId, item.id),
      sessionId: session.id,
      itemId: item.id,
      studentId: session.studentId,
      revealedAt: now,
    };
    const existing = await this.practiceRepository.listHintReveals(item.id);
    if (existing.some((entry) => entry.id === reveal.id)) return item.hint;

    try {
      await this.practiceRepository.appendHintReveal(reveal);
    } catch (error) {
      const reread = await this.practiceRepository.listHintReveals(item.id);
      if (reread.some((entry) => entry.id === reveal.id)) return item.hint;
      throw error;
    }
    return item.hint;
  }

  async submitAttempt(input: SubmitAttemptInput, now: string): Promise<Attempt> {
    requireTimestamp(now, 'attempt submission time');
    const session = await this.practiceRepository.getPracticeSession(input.sessionId);
    if (!session) throw new Error(`Unknown practice session id: ${input.sessionId}`);
    const item = await this.practiceRepository.getPracticeItem(input.itemId);
    if (!item) throw new Error(`Unknown practice item id: ${input.itemId}`);
    if (item.sessionId !== session.id || item.studentId !== session.studentId || item.objectiveId !== session.objectiveId) {
      throw new Error('attempt coordinates must match trusted practice session and item');
    }

    const existing = await this.practiceRepository.getAttempt(input.attemptId);
    if (existing) {
      if (!matchesCommand(existing, input)) throw new Error('attempt idempotency conflict');
      await this.ensureEvidence(existing, item);
      return existing;
    }

    const previous = await this.practiceRepository.listAttemptsForItem(item.id);
    validateRetryAttempt(previous, input, {
      studentId: session.studentId,
      sessionId: session.id,
      itemId: item.id,
      objectiveId: session.objectiveId,
    });
    const reveals = await this.practiceRepository.listHintReveals(item.id);
    const hintUsed = reveals.some((reveal) => Date.parse(reveal.revealedAt) <= Date.parse(now));
    const grade = gradeAnswer(input.answerText, item.answerSpec);
    const attempt: Attempt = {
      id: input.attemptId,
      sessionId: session.id,
      itemId: item.id,
      studentId: session.studentId,
      objectiveId: session.objectiveId,
      answerText: input.answerText,
      outcome: grade.outcome,
      hintUsed,
      retryOfAttemptId: input.retryOfAttemptId,
      gradingPolicyVersion: 'grading-v1',
      submittedAt: now,
      recordedAt: now,
    };

    try {
      await this.practiceRepository.appendAttempt(attempt);
    } catch (error) {
      const winner = await this.practiceRepository.getAttempt(input.attemptId);
      if (!winner || !matchesCommand(winner, input)) throw error;
      await this.ensureEvidence(winner, item);
      return winner;
    }

    await this.ensureEvidence(attempt, item);
    return attempt;
  }

  private async ensureEvidence(attempt: Attempt, item: Parameters<typeof projectAttemptToEvidence>[1]): Promise<void> {
    const projected = projectAttemptToEvidence(attempt, item);
    const existing = await this.learningRepository.getEvidence(evidenceIdForAttempt(attempt.id));
    if (existing) {
      if (!sameEvidence(existing, projected)) throw new Error('practice evidence idempotency conflict');
      return;
    }
    try {
      await this.learningRepository.appendEvidence(projected);
    } catch (error) {
      const reread = await this.learningRepository.getEvidence(projected.id);
      if (reread && sameEvidence(reread, projected)) return;
      throw error;
    }
  }
}
