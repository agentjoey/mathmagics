import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { GeneratedLessonBriefContent, PlanningRationale } from '@/lib/planning';
import type { AnswerSpec, PracticeProblemSpec } from '@/lib/practice';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

export const students = pgTable('students', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  levelId: text('level_id').notNull(),
  learningMode: text('learning_mode').notNull(),
  sessionsPerWeek: integer('sessions_per_week').notNull(),
  minutesPerSession: integer('minutes_per_session').notNull(),
  createdAt: instant('created_at').notNull(),
  updatedAt: instant('updated_at').notNull(),
});

export const currentPositions = pgTable('current_positions', {
  studentId: text('student_id').primaryKey().references(() => students.id, { onDelete: 'cascade' }),
  levelId: text('level_id').notNull(),
  topicId: text('topic_id'),
  objectiveId: text('objective_id'),
  recordedAt: instant('recorded_at').notNull(),
  source: text('source').notNull(),
});

export const evidenceRecords = pgTable('evidence_records', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  objectiveId: text('objective_id').notNull(),
  type: text('type').notNull(),
  observedAt: instant('observed_at').notNull(),
  recordedAt: instant('recorded_at').notNull(),
  originKind: text('origin_kind').notNull(),
  originRefId: text('origin_ref_id'),
}, (table) => [
  index('evidence_student_objective_order_idx').on(
    table.studentId,
    table.objectiveId,
    table.observedAt,
    table.recordedAt,
    table.id,
  ),
  index('evidence_student_observed_idx').on(table.studentId, table.observedAt),
]);

export const weeklyPlans = pgTable('weekly_plans', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  sessionsPerWeek: integer('sessions_per_week').notNull(),
  minutesPerSession: integer('minutes_per_session').notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  uniqueIndex('weekly_plan_student_week_uq').on(table.studentId, table.weekStart),
  index('weekly_plan_student_week_idx').on(table.studentId, table.weekStart),
]);

export const dailyLessons = pgTable('daily_lessons', {
  id: text('id').primaryKey(),
  weeklyPlanId: text('weekly_plan_id').notNull().references(() => weeklyPlans.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  intent: text('intent').notNull(),
  objectiveIds: jsonb('objective_ids').$type<string[]>().notNull(),
  estimatedMinutes: integer('estimated_minutes').notNull(),
  rationale: jsonb('rationale').$type<PlanningRationale[]>().notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  uniqueIndex('daily_lesson_plan_sequence_uq').on(table.weeklyPlanId, table.sequence),
]);

export const lessonExecutionEvents = pgTable('lesson_execution_events', {
  id: text('id').primaryKey(),
  lessonId: text('lesson_id').notNull().references(() => dailyLessons.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  occurredAt: instant('occurred_at').notNull(),
  actualMinutes: integer('actual_minutes'),
}, (table) => [
  index('lesson_execution_order_idx').on(table.lessonId, table.occurredAt, table.id),
]);

export const lessonBriefs = pgTable('lesson_briefs', {
  id: text('id').primaryKey(),
  lessonId: text('lesson_id').notNull().references(() => dailyLessons.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  generator: text('generator').notNull(),
  model: text('model').notNull(),
  contextVersion: text('context_version').notNull(),
  content: jsonb('content').$type<GeneratedLessonBriefContent>().notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  index('lesson_brief_order_idx').on(table.lessonId, table.createdAt, table.id),
]);

export const practiceSessions = pgTable('practice_sessions', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull().references(() => dailyLessons.id, { onDelete: 'cascade' }),
  objectiveId: text('objective_id').notNull(),
  policyVersion: text('policy_version').notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  uniqueIndex('practice_session_lesson_objective_uq').on(table.lessonId, table.objectiveId),
]);

export const practiceItems = pgTable('practice_items', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => practiceSessions.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  objectiveId: text('objective_id').notNull(),
  sequence: integer('sequence').notNull(),
  difficultyBand: text('difficulty_band').notNull(),
  problemSpec: jsonb('problem_spec').$type<PracticeProblemSpec>().notNull(),
  prompt: text('prompt').notNull(),
  answerSpec: jsonb('answer_spec').$type<AnswerSpec>().notNull(),
  hint: text('hint'),
  solutionOutline: jsonb('solution_outline').$type<string[]>().notNull(),
  generator: text('generator').notNull(),
  generatorVersion: text('generator_version').notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  uniqueIndex('practice_item_session_sequence_uq').on(table.sessionId, table.sequence),
]);

export const practiceHintReveals = pgTable('practice_hint_reveals', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => practiceSessions.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => practiceItems.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  revealedAt: instant('revealed_at').notNull(),
}, (table) => [
  uniqueIndex('practice_hint_student_item_uq').on(table.studentId, table.itemId),
]);

export const attempts = pgTable('attempts', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => practiceSessions.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => practiceItems.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  objectiveId: text('objective_id').notNull(),
  answerText: text('answer_text').notNull(),
  outcome: text('outcome').notNull(),
  hintUsed: boolean('hint_used').notNull(),
  retryOfAttemptId: text('retry_of_attempt_id').references((): AnyPgColumn => attempts.id),
  gradingPolicyVersion: text('grading_policy_version').notNull(),
  submittedAt: instant('submitted_at').notNull(),
  recordedAt: instant('recorded_at').notNull(),
}, (table) => [
  uniqueIndex('attempt_retry_parent_uq').on(table.retryOfAttemptId),
  index('attempt_item_order_idx').on(table.itemId, table.submittedAt, table.id),
  index('attempt_student_objective_order_idx').on(
    table.studentId,
    table.objectiveId,
    table.submittedAt,
    table.id,
  ),
]);
