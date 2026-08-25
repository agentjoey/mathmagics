CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"item_id" text NOT NULL,
	"student_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"answer_text" text NOT NULL,
	"outcome" text NOT NULL,
	"hint_used" boolean NOT NULL,
	"retry_of_attempt_id" text,
	"grading_policy_version" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_hint_reveals" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"item_id" text NOT NULL,
	"student_id" text NOT NULL,
	"revealed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"difficulty_band" text NOT NULL,
	"problem_spec" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"answer_spec" jsonb NOT NULL,
	"hint" text,
	"solution_outline" jsonb NOT NULL,
	"generator" text NOT NULL,
	"generator_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_item_id_practice_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."practice_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_retry_of_attempt_id_attempts_id_fk" FOREIGN KEY ("retry_of_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_hint_reveals" ADD CONSTRAINT "practice_hint_reveals_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_hint_reveals" ADD CONSTRAINT "practice_hint_reveals_item_id_practice_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."practice_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_hint_reveals" ADD CONSTRAINT "practice_hint_reveals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_items" ADD CONSTRAINT "practice_items_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_items" ADD CONSTRAINT "practice_items_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."daily_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_retry_parent_uq" ON "attempts" USING btree ("retry_of_attempt_id");--> statement-breakpoint
CREATE INDEX "attempt_item_order_idx" ON "attempts" USING btree ("item_id","submitted_at","id");--> statement-breakpoint
CREATE INDEX "attempt_student_objective_order_idx" ON "attempts" USING btree ("student_id","objective_id","submitted_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_hint_student_item_uq" ON "practice_hint_reveals" USING btree ("student_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_item_session_sequence_uq" ON "practice_items" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_session_lesson_objective_uq" ON "practice_sessions" USING btree ("lesson_id","objective_id");