CREATE TABLE "students" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "level_id" text NOT NULL,
  "learning_mode" text NOT NULL,
  "sessions_per_week" integer NOT NULL,
  "minutes_per_session" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "current_positions" (
  "student_id" text PRIMARY KEY NOT NULL,
  "level_id" text NOT NULL,
  "topic_id" text,
  "objective_id" text,
  "recorded_at" timestamp with time zone NOT NULL,
  "source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_records" (
  "id" text PRIMARY KEY NOT NULL,
  "student_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "type" text NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "recorded_at" timestamp with time zone NOT NULL,
  "origin_kind" text NOT NULL,
  "origin_ref_id" text
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
  "id" text PRIMARY KEY NOT NULL,
  "student_id" text NOT NULL,
  "week_start" date NOT NULL,
  "sessions_per_week" integer NOT NULL,
  "minutes_per_session" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_lessons" (
  "id" text PRIMARY KEY NOT NULL,
  "weekly_plan_id" text NOT NULL,
  "student_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "intent" text NOT NULL,
  "objective_ids" jsonb NOT NULL,
  "estimated_minutes" integer NOT NULL,
  "rationale" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_execution_events" (
  "id" text PRIMARY KEY NOT NULL,
  "lesson_id" text NOT NULL,
  "student_id" text NOT NULL,
  "type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "actual_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "lesson_briefs" (
  "id" text PRIMARY KEY NOT NULL,
  "lesson_id" text NOT NULL,
  "student_id" text NOT NULL,
  "generator" text NOT NULL,
  "model" text NOT NULL,
  "context_version" text NOT NULL,
  "content" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "current_positions" ADD CONSTRAINT "current_positions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_lessons" ADD CONSTRAINT "daily_lessons_weekly_plan_id_weekly_plans_id_fk" FOREIGN KEY ("weekly_plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_lessons" ADD CONSTRAINT "daily_lessons_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lesson_execution_events" ADD CONSTRAINT "lesson_execution_events_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."daily_lessons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lesson_execution_events" ADD CONSTRAINT "lesson_execution_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lesson_briefs" ADD CONSTRAINT "lesson_briefs_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."daily_lessons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lesson_briefs" ADD CONSTRAINT "lesson_briefs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "evidence_student_objective_order_idx" ON "evidence_records" USING btree ("student_id","objective_id","observed_at","recorded_at","id");
--> statement-breakpoint
CREATE INDEX "evidence_student_observed_idx" ON "evidence_records" USING btree ("student_id","observed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_student_week_uq" ON "weekly_plans" USING btree ("student_id","week_start");
--> statement-breakpoint
CREATE INDEX "weekly_plan_student_week_idx" ON "weekly_plans" USING btree ("student_id","week_start");
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_lesson_plan_sequence_uq" ON "daily_lessons" USING btree ("weekly_plan_id","sequence");
--> statement-breakpoint
CREATE INDEX "lesson_execution_order_idx" ON "lesson_execution_events" USING btree ("lesson_id","occurred_at","id");
--> statement-breakpoint
CREATE INDEX "lesson_brief_order_idx" ON "lesson_briefs" USING btree ("lesson_id","created_at","id");
