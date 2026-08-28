import { findNextEffectiveLesson } from '@/lib/adaptation';
import type { AdaptiveRepository } from '@/lib/adaptation';
import { deriveLessonExecutionState } from '@/lib/planning';
import type {
  DailyLesson,
  DailyLessonExecutionState,
  LessonExecutionEventType,
  PlanningRepository,
} from '@/lib/planning';
import { toStudentPracticeItem } from '@/lib/practice';
import type {
  Attempt,
  PracticeItem,
  PracticeService,
  PracticeSession,
  StudentPracticeItem,
  SubmitAttemptInput,
} from '@/lib/practice';

export interface PracticeOwnershipReader {
  getPracticeSession(sessionId: string): Promise<Pick<PracticeSession, 'id' | 'studentId'> | undefined>;
  getPracticeItem(itemId: string): Promise<Pick<PracticeItem, 'id' | 'sessionId' | 'studentId'> | undefined>;
  listPracticeItems(sessionId: string): Promise<PracticeItem[]>;
}

export interface PilotSessionDependencies {
  planning: PlanningRepository;
  adaptive: AdaptiveRepository;
  practice: PracticeService;
  practiceOwnership: PracticeOwnershipReader;
  clock: { now(): string };
  ids: {
    executionEventId(lessonId: string, type: LessonExecutionEventType, at: string): string;
  };
}

export interface PilotLessonSessionView {
  lessonId: string;
  intent: DailyLesson['intent'];
  objectiveIds: string[];
  adapted: boolean;
  execution: DailyLessonExecutionState;
}

export interface PilotPracticeSessionView {
  session: {
    id: string;
    lessonId: string;
    objectiveId: string;
    createdAt: string;
  };
  items: StudentPracticeItem[];
}

export interface PilotPracticeAttemptView {
  id: string;
  outcome: Attempt['outcome'];
  hintUsed: boolean;
  retryOfAttemptId?: string;
  submittedAt: string;
}

function requireTimestamp(value: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error('at must be a valid ISO date-time string');
}

function toPilotPracticeAttemptView(attempt: Attempt): PilotPracticeAttemptView {
  return {
    id: attempt.id,
    outcome: attempt.outcome,
    hintUsed: attempt.hintUsed,
    ...(attempt.retryOfAttemptId ? { retryOfAttemptId: attempt.retryOfAttemptId } : {}),
    submittedAt: attempt.submittedAt,
  };
}

export class PilotSessionService {
  constructor(private readonly dependencies: PilotSessionDependencies) {}

  async getStartedLesson(studentId: string, at = this.dependencies.clock.now()): Promise<PilotLessonSessionView | null> {
    requireTimestamp(at);
    return this.findStartedLesson(studentId, at);
  }

  async startNextLesson(studentId: string, at = this.dependencies.clock.now()): Promise<PilotLessonSessionView> {
    requireTimestamp(at);
    const started = await this.findStartedLesson(studentId, at);
    if (started) return started;

    const projection = await findNextEffectiveLesson(
      this.dependencies.planning,
      this.dependencies.adaptive,
      studentId,
      at,
    );
    if (!projection) throw new Error('No available lesson for student');
    const lesson = projection.effectiveLesson.lesson;
    if (lesson.studentId !== studentId) throw new Error('lesson does not belong to student');
    const existing = await this.executionAt(lesson.id, at);
    if (existing.status !== 'PLANNED') throw new Error(`next lesson must be PLANNED, got ${existing.status}`);

    const event = {
      id: this.dependencies.ids.executionEventId(lesson.id, 'STARTED', at),
      lessonId: lesson.id,
      studentId,
      type: 'STARTED' as const,
      occurredAt: at,
    };
    await this.dependencies.planning.appendExecutionEvent(event);
    return this.lessonView(lesson, projection.effectiveLesson.adapted, deriveLessonExecutionState(lesson.id, [
      ...(await this.eventsAt(lesson.id, at)),
    ]));
  }

  async completeLesson(studentId: string, lessonId: string, actualMinutes: number, at = this.dependencies.clock.now()): Promise<DailyLessonExecutionState> {
    return this.appendTerminalEvent(studentId, lessonId, 'COMPLETED', at, actualMinutes);
  }

  async skipLesson(studentId: string, lessonId: string, actualMinutes?: number, at = this.dependencies.clock.now()): Promise<DailyLessonExecutionState> {
    return this.appendTerminalEvent(studentId, lessonId, 'SKIPPED', at, actualMinutes);
  }

  async createPracticeSession(
    studentId: string,
    lessonId: string,
    objectiveId: string,
    at = this.dependencies.clock.now(),
  ): Promise<PilotPracticeSessionView> {
    requireTimestamp(at);
    const lesson = await this.requireOwnedLesson(studentId, lessonId);
    if (!lesson.objectiveIds.includes(objectiveId)) throw new Error('objective does not belong to lesson');
    const session = await this.dependencies.practice.createPracticeSession(lessonId, objectiveId, at);
    if (session.studentId !== studentId || session.lessonId !== lessonId || session.objectiveId !== objectiveId) {
      throw new Error('practice session coordinates must match trusted lesson');
    }
    const items = await this.dependencies.practiceOwnership.listPracticeItems(session.id);
    for (const item of items) {
      if (item.studentId !== studentId || item.sessionId !== session.id || item.objectiveId !== objectiveId) {
        throw new Error('practice item coordinates must match trusted session');
      }
    }
    return {
      session: {
        id: session.id,
        lessonId: session.lessonId,
        objectiveId: session.objectiveId,
        createdAt: session.createdAt,
      },
      items: items.map(toStudentPracticeItem),
    };
  }

  async revealHint(studentId: string, sessionId: string, itemId: string, at = this.dependencies.clock.now()): Promise<string> {
    requireTimestamp(at);
    await this.requireOwnedPracticeCoordinates(studentId, sessionId, itemId);
    return this.dependencies.practice.revealHint(sessionId, itemId, at);
  }

  async submitPracticeAttempt(
    studentId: string,
    input: SubmitAttemptInput,
    at = this.dependencies.clock.now(),
  ): Promise<PilotPracticeAttemptView> {
    requireTimestamp(at);
    await this.requireOwnedPracticeCoordinates(studentId, input.sessionId, input.itemId);
    return toPilotPracticeAttemptView(await this.dependencies.practice.submitAttempt(input, at));
  }

  private async appendTerminalEvent(
    studentId: string,
    lessonId: string,
    type: Extract<LessonExecutionEventType, 'COMPLETED' | 'SKIPPED'>,
    at: string,
    actualMinutes?: number,
  ): Promise<DailyLessonExecutionState> {
    requireTimestamp(at);
    await this.requireOwnedLesson(studentId, lessonId);
    const before = await this.executionAt(lessonId, at);
    if (type === 'COMPLETED' && before.status !== 'STARTED') {
      throw new Error(`lesson must be STARTED before completion, got ${before.status}`);
    }
    if (type === 'SKIPPED' && before.status !== 'PLANNED' && before.status !== 'STARTED') {
      throw new Error(`lesson cannot be skipped from ${before.status}`);
    }
    const event = {
      id: this.dependencies.ids.executionEventId(lessonId, type, at),
      lessonId,
      studentId,
      type,
      occurredAt: at,
      ...(actualMinutes !== undefined ? { actualMinutes } : {}),
    };
    await this.dependencies.planning.appendExecutionEvent(event);
    return deriveLessonExecutionState(lessonId, await this.eventsAt(lessonId, at));
  }

  private async findStartedLesson(studentId: string, at: string): Promise<PilotLessonSessionView | null> {
    const candidates: Array<{ weekStart: string; lesson: DailyLesson; adapted: boolean; execution: DailyLessonExecutionState }> = [];
    const plans = (await this.dependencies.planning.listWeeklyPlansForStudent(studentId))
      .filter((plan) => Date.parse(plan.createdAt) <= Date.parse(at));
    for (const plan of plans) {
      const lessons = (await this.dependencies.planning.listDailyLessonsForPlan(plan.id))
        .filter((lesson) => Date.parse(lesson.createdAt) <= Date.parse(at));
      for (const lesson of lessons) {
        const execution = await this.executionAt(lesson.id, at);
        if (execution.status !== 'STARTED') continue;
        const incoming = await this.dependencies.adaptive.getSupersessionByReplacementLesson(lesson.id);
        candidates.push({
          weekStart: plan.weekStart,
          lesson,
          adapted: incoming !== undefined && Date.parse(incoming.createdAt) <= Date.parse(at),
          execution,
        });
      }
    }
    candidates.sort((left, right) => left.weekStart.localeCompare(right.weekStart)
      || left.lesson.sequence - right.lesson.sequence
      || left.lesson.id.localeCompare(right.lesson.id));
    if (candidates.length > 1) throw new Error('student has multiple STARTED lessons');
    const current = candidates[0];
    return current ? this.lessonView(current.lesson, current.adapted, current.execution) : null;
  }

  private async executionAt(lessonId: string, at: string): Promise<DailyLessonExecutionState> {
    return deriveLessonExecutionState(lessonId, await this.eventsAt(lessonId, at));
  }

  private async eventsAt(lessonId: string, at: string) {
    return (await this.dependencies.planning.listExecutionEvents(lessonId))
      .filter((event) => Date.parse(event.occurredAt) <= Date.parse(at));
  }

  private async requireOwnedLesson(studentId: string, lessonId: string): Promise<DailyLesson> {
    const lesson = await this.dependencies.planning.getDailyLesson(lessonId);
    if (!lesson) throw new Error(`Unknown daily lesson id: ${lessonId}`);
    if (lesson.studentId !== studentId) throw new Error('lesson does not belong to student');
    return lesson;
  }

  private async requireOwnedPracticeCoordinates(studentId: string, sessionId: string, itemId: string): Promise<void> {
    const session = await this.dependencies.practiceOwnership.getPracticeSession(sessionId);
    if (!session) throw new Error(`Unknown practice session id: ${sessionId}`);
    if (session.studentId !== studentId) throw new Error('practice session does not belong to student');
    const item = await this.dependencies.practiceOwnership.getPracticeItem(itemId);
    if (!item) throw new Error(`Unknown practice item id: ${itemId}`);
    if (item.studentId !== studentId) throw new Error('practice item does not belong to student');
    if (item.sessionId !== sessionId) throw new Error('practice item does not belong to session');
  }

  private lessonView(lesson: DailyLesson, adapted: boolean, execution: DailyLessonExecutionState): PilotLessonSessionView {
    return {
      lessonId: lesson.id,
      intent: lesson.intent,
      objectiveIds: [...lesson.objectiveIds],
      adapted,
      execution: structuredClone(execution),
    };
  }
}
