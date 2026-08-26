import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import type { DiagnosisTarget, ReasoningCheckSpec } from '@/lib/correction';
import type { HomeworkProblemExtraction } from '@/lib/homework';
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

export const homeworkSubmissions = pgTable('homework_submissions', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  sourceSha256: text('source_sha256').notNull(),
  mimeType: text('mime_type').notNull(),
  byteLength: integer('byte_length').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  schemaVersion: text('schema_version').notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  uniqueIndex('homework_submission_student_hash_uq').on(table.studentId, table.sourceSha256),
  index('homework_submission_student_order_idx').on(table.studentId, table.createdAt, table.id),
]);

export const homeworkProblems = pgTable('homework_problems', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => homeworkSubmissions.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  extraction: jsonb('extraction').$type<HomeworkProblemExtraction>().notNull(),
  trustPolicyVersion: text('trust_policy_version').notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  uniqueIndex('homework_problem_submission_sequence_uq').on(table.submissionId, table.sequence),
  index('homework_problem_submission_order_idx').on(table.submissionId, table.sequence, table.id),
]);

export const homeworkConfirmations = pgTable('homework_confirmations', {
  id: text('id').primaryKey(),
  problemId: text('problem_id').notNull().references(() => homeworkProblems.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  corrections: jsonb('corrections').$type<Record<string, string>>().notNull(),
  confirmerRole: text('confirmer_role').notNull(),
  policyVersion: text('policy_version').notNull(),
  confirmedAt: instant('confirmed_at').notNull(),
}, (table) => [
  index('homework_confirmation_problem_order_idx').on(table.problemId, table.confirmedAt, table.id),
]);

export const mistakes = pgTable('mistakes', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  objectiveId: text('objective_id').notNull(),
  initialAttemptId: text('initial_attempt_id').notNull().references((): AnyPgColumn => attempts.id),
  initialDiagnosisTarget: jsonb('initial_diagnosis_target').$type<DiagnosisTarget>().notNull(),
  diagnosisPolicyVersion: text('diagnosis_policy_version').notNull(),
  firstObservedAt: instant('first_observed_at').notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  index('mistake_student_objective_order_idx').on(table.studentId, table.objectiveId, table.firstObservedAt, table.id),
]);

export const mistakeAttemptLinks = pgTable('mistake_attempt_links', {
  mistakeId: text('mistake_id').notNull().references(() => mistakes.id, { onDelete: 'cascade' }),
  attemptId: text('attempt_id').notNull().references((): AnyPgColumn => attempts.id),
  role: text('role').notNull(),
  linkedAt: instant('linked_at').notNull(),
}, (table) => [
  uniqueIndex('mistake_attempt_link_uq').on(table.mistakeId, table.attemptId),
  index('mistake_attempt_link_order_idx').on(table.mistakeId, table.linkedAt, table.attemptId),
]);

export const mistakeEvents = pgTable('mistake_events', {
  id: text('id').primaryKey(),
  mistakeId: text('mistake_id').notNull().references(() => mistakes.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  actorKind: text('actor_kind').notNull(),
  policyVersion: text('policy_version').notNull(),
  occurredAt: instant('occurred_at').notNull(),
}, (table) => [
  index('mistake_event_order_idx').on(table.mistakeId, table.occurredAt, table.id),
]);

export const correctionItems = pgTable('correction_items', {
  id: text('id').primaryKey(),
  mistakeId: text('mistake_id').notNull().references(() => mistakes.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  objectiveId: text('objective_id').notNull(),
  kind: text('kind').notNull(),
  sourceAttemptId: text('source_attempt_id').notNull().references((): AnyPgColumn => attempts.id),
  transferRound: integer('transfer_round'),
  problemSpec: jsonb('problem_spec').$type<PracticeProblemSpec>().notNull(),
  answerSpec: jsonb('answer_spec').$type<AnswerSpec>().notNull(),
  prompt: text('prompt').notNull(),
  hint: text('hint'),
  solutionOutline: jsonb('solution_outline').$type<string[]>().notNull(),
  generator: text('generator').notNull(),
  generatorVersion: text('generator_version').notNull(),
  createdAt: instant('created_at').notNull(),
}, (table) => [
  index('correction_item_mistake_order_idx').on(table.mistakeId, table.createdAt, table.id),
]);

export const correctionReasoningChecks = pgTable('correction_reasoning_checks', {
  id: text('id').primaryKey(),
  mistakeId: text('mistake_id').notNull().references(() => mistakes.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  objectiveId: text('objective_id').notNull(),
  checkSpec: jsonb('check_spec').$type<ReasoningCheckSpec>().notNull(),
  response: jsonb('response').$type<Record<string, string>>().notNull(),
  outcome: text('outcome').notNull(),
  assisted: boolean('assisted').notNull(),
  policyVersion: text('policy_version').notNull(),
  submittedAt: instant('submitted_at').notNull(),
  recordedAt: instant('recorded_at').notNull(),
}, (table) => [
  index('correction_reasoning_mistake_order_idx').on(table.mistakeId, table.submittedAt, table.id),
]);

export const attempts = pgTable('attempts', {
  id: text('id').primaryKey(),
  sourceKind: text('source_kind').notNull().default('PRACTICE'),
  sessionId: text('session_id').references(() => practiceSessions.id, { onDelete: 'cascade' }),
  itemId: text('item_id').references(() => practiceItems.id, { onDelete: 'cascade' }),
  homeworkSubmissionId: text('homework_submission_id').references(() => homeworkSubmissions.id, { onDelete: 'cascade' }),
  homeworkProblemId: text('homework_problem_id').references(() => homeworkProblems.id, { onDelete: 'cascade' }),
  correctionMistakeId: text('correction_mistake_id').references(() => mistakes.id, { onDelete: 'cascade' }),
  correctionItemId: text('correction_item_id').references(() => correctionItems.id, { onDelete: 'cascade' }),
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
  check('attempt_source_coordinates_ck', sql`
    (
      ${table.sourceKind} = 'PRACTICE'
      AND ${table.sessionId} IS NOT NULL
      AND ${table.itemId} IS NOT NULL
      AND ${table.homeworkSubmissionId} IS NULL
      AND ${table.homeworkProblemId} IS NULL
      AND ${table.correctionMistakeId} IS NULL
      AND ${table.correctionItemId} IS NULL
    ) OR (
      ${table.sourceKind} = 'HOMEWORK'
      AND ${table.sessionId} IS NULL
      AND ${table.itemId} IS NULL
      AND ${table.homeworkSubmissionId} IS NOT NULL
      AND ${table.homeworkProblemId} IS NOT NULL
      AND ${table.correctionMistakeId} IS NULL
      AND ${table.correctionItemId} IS NULL
    ) OR (
      ${table.sourceKind} = 'CORRECTION'
      AND ${table.sessionId} IS NULL
      AND ${table.itemId} IS NULL
      AND ${table.homeworkSubmissionId} IS NULL
      AND ${table.homeworkProblemId} IS NULL
      AND ${table.correctionMistakeId} IS NOT NULL
      AND ${table.correctionItemId} IS NOT NULL
    )
  `),
  uniqueIndex('attempt_retry_parent_uq').on(table.retryOfAttemptId),
  index('attempt_item_order_idx').on(table.itemId, table.submittedAt, table.id),
  index('attempt_homework_problem_order_idx').on(table.homeworkProblemId, table.submittedAt, table.id),
  index('attempt_correction_item_order_idx').on(table.correctionItemId, table.submittedAt, table.id),
  index('attempt_student_objective_order_idx').on(
    table.studentId,
    table.objectiveId,
    table.submittedAt,
    table.id,
  ),
]);
