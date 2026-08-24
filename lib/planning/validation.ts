import type {
  DailyLesson,
  LessonExecutionEvent,
  LessonExecutionEventType,
  LessonIntent,
  PlannerCandidateReason,
  WeeklyPlan,
} from './types';

const LESSON_INTENTS: LessonIntent[] = ['LEARN', 'PRACTICE', 'REVIEW', 'CORRECTION', 'ASSESSMENT'];
const CANDIDATE_REASONS: PlannerCandidateReason[] = [
  'REVIEW_DUE',
  'PREREQUISITE_SUPPORT',
  'CURRENT_POSITION',
  'NEXT_IN_SEQUENCE',
];
const EXECUTION_EVENT_TYPES: LessonExecutionEventType[] = ['STARTED', 'COMPLETED', 'SKIPPED'];

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must be non-empty`);
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid ISO date-time string`);
  return parsed;
}

function assertCalendarDate(value: string, field: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error(`${field} must be a valid YYYY-MM-DD calendar date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${field} must be a valid YYYY-MM-DD calendar date`);
  }
}

export function assertValidWeeklyPlan(plan: WeeklyPlan): void {
  requireNonEmpty(plan.id, 'weekly plan id');
  requireNonEmpty(plan.studentId, 'weekly plan studentId');
  assertCalendarDate(plan.weekStart, 'weekStart');
  if (!Number.isInteger(plan.sessionsPerWeek) || plan.sessionsPerWeek < 1 || plan.sessionsPerWeek > 7) {
    throw new Error('sessionsPerWeek must be an integer from 1 through 7');
  }
  if (!Number.isInteger(plan.minutesPerSession) || plan.minutesPerSession < 10 || plan.minutesPerSession > 180) {
    throw new Error('minutesPerSession must be an integer from 10 through 180');
  }
  parseTimestamp(plan.createdAt, 'createdAt');
}

export function assertValidDailyLesson(lesson: DailyLesson): void {
  requireNonEmpty(lesson.id, 'daily lesson id');
  requireNonEmpty(lesson.weeklyPlanId, 'daily lesson weeklyPlanId');
  requireNonEmpty(lesson.studentId, 'daily lesson studentId');
  if (!Number.isInteger(lesson.sequence) || lesson.sequence < 1) {
    throw new Error('sequence must be a positive integer');
  }
  if (!LESSON_INTENTS.includes(lesson.intent)) throw new Error(`invalid lesson intent: ${lesson.intent}`);

  const uniqueObjectiveIds = new Set(lesson.objectiveIds);
  if (
    lesson.objectiveIds.length < 1 ||
    lesson.objectiveIds.length > 2 ||
    uniqueObjectiveIds.size !== lesson.objectiveIds.length ||
    lesson.objectiveIds.some((objectiveId) => !objectiveId.trim())
  ) {
    throw new Error('objectiveIds must contain one or two unique objective ids');
  }
  if (!Number.isInteger(lesson.estimatedMinutes) || lesson.estimatedMinutes <= 0) {
    throw new Error('estimatedMinutes must be a positive integer');
  }
  for (const rationale of lesson.rationale) {
    if (!CANDIDATE_REASONS.includes(rationale.code)) {
      throw new Error(`invalid planning rationale code: ${rationale.code}`);
    }
    requireNonEmpty(rationale.objectiveId, 'rationale objectiveId');
    if (rationale.targetObjectiveId !== undefined) {
      requireNonEmpty(rationale.targetObjectiveId, 'rationale targetObjectiveId');
    }
  }
  parseTimestamp(lesson.createdAt, 'createdAt');
}

export function assertValidLessonExecutionEvent(event: LessonExecutionEvent): void {
  requireNonEmpty(event.id, 'execution event id');
  requireNonEmpty(event.lessonId, 'execution event lessonId');
  requireNonEmpty(event.studentId, 'execution event studentId');
  if (!EXECUTION_EVENT_TYPES.includes(event.type)) {
    throw new Error(`invalid lesson execution event type: ${event.type}`);
  }
  parseTimestamp(event.occurredAt, 'occurredAt');
  if (event.actualMinutes !== undefined && (!Number.isInteger(event.actualMinutes) || event.actualMinutes <= 0)) {
    throw new Error('actualMinutes must be a positive integer when provided');
  }
  if (event.type === 'STARTED' && event.actualMinutes !== undefined) {
    throw new Error('actualMinutes is not allowed on STARTED events');
  }
}
