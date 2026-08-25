CREATE TABLE "correction_items" (
	"id" text PRIMARY KEY NOT NULL,
	"mistake_id" text NOT NULL,
	"student_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_attempt_id" text NOT NULL,
	"transfer_round" integer,
	"problem_spec" jsonb NOT NULL,
	"answer_spec" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"hint" text,
	"solution_outline" jsonb NOT NULL,
	"generator" text NOT NULL,
	"generator_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_reasoning_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"mistake_id" text NOT NULL,
	"student_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"check_spec" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"assisted" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mistake_attempt_links" (
	"mistake_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"role" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mistake_events" (
	"id" text PRIMARY KEY NOT NULL,
	"mistake_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"actor_kind" text NOT NULL,
	"policy_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mistakes" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"initial_attempt_id" text NOT NULL,
	"initial_diagnosis_target" jsonb NOT NULL,
	"diagnosis_policy_version" text NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" DROP CONSTRAINT "attempt_source_coordinates_ck";--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "correction_mistake_id" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "correction_item_id" text;--> statement-breakpoint
ALTER TABLE "correction_items" ADD CONSTRAINT "correction_items_mistake_id_mistakes_id_fk" FOREIGN KEY ("mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_items" ADD CONSTRAINT "correction_items_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_items" ADD CONSTRAINT "correction_items_source_attempt_id_attempts_id_fk" FOREIGN KEY ("source_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_reasoning_checks" ADD CONSTRAINT "correction_reasoning_checks_mistake_id_mistakes_id_fk" FOREIGN KEY ("mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_reasoning_checks" ADD CONSTRAINT "correction_reasoning_checks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_attempt_links" ADD CONSTRAINT "mistake_attempt_links_mistake_id_mistakes_id_fk" FOREIGN KEY ("mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_attempt_links" ADD CONSTRAINT "mistake_attempt_links_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_events" ADD CONSTRAINT "mistake_events_mistake_id_mistakes_id_fk" FOREIGN KEY ("mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_initial_attempt_id_attempts_id_fk" FOREIGN KEY ("initial_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correction_item_mistake_order_idx" ON "correction_items" USING btree ("mistake_id","created_at","id");--> statement-breakpoint
CREATE INDEX "correction_reasoning_mistake_order_idx" ON "correction_reasoning_checks" USING btree ("mistake_id","submitted_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "mistake_attempt_link_uq" ON "mistake_attempt_links" USING btree ("mistake_id","attempt_id");--> statement-breakpoint
CREATE INDEX "mistake_attempt_link_order_idx" ON "mistake_attempt_links" USING btree ("mistake_id","linked_at","attempt_id");--> statement-breakpoint
CREATE INDEX "mistake_event_order_idx" ON "mistake_events" USING btree ("mistake_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "mistake_student_objective_order_idx" ON "mistakes" USING btree ("student_id","objective_id","first_observed_at","id");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_correction_mistake_id_mistakes_id_fk" FOREIGN KEY ("correction_mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_correction_item_id_correction_items_id_fk" FOREIGN KEY ("correction_item_id") REFERENCES "public"."correction_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_correction_item_order_idx" ON "attempts" USING btree ("correction_item_id","submitted_at","id");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempt_source_coordinates_ck" CHECK (
    (
      "attempts"."source_kind" = 'PRACTICE'
      AND "attempts"."session_id" IS NOT NULL
      AND "attempts"."item_id" IS NOT NULL
      AND "attempts"."homework_submission_id" IS NULL
      AND "attempts"."homework_problem_id" IS NULL
      AND "attempts"."correction_mistake_id" IS NULL
      AND "attempts"."correction_item_id" IS NULL
    ) OR (
      "attempts"."source_kind" = 'HOMEWORK'
      AND "attempts"."session_id" IS NULL
      AND "attempts"."item_id" IS NULL
      AND "attempts"."homework_submission_id" IS NOT NULL
      AND "attempts"."homework_problem_id" IS NOT NULL
      AND "attempts"."correction_mistake_id" IS NULL
      AND "attempts"."correction_item_id" IS NULL
    ) OR (
      "attempts"."source_kind" = 'CORRECTION'
      AND "attempts"."session_id" IS NULL
      AND "attempts"."item_id" IS NULL
      AND "attempts"."homework_submission_id" IS NULL
      AND "attempts"."homework_problem_id" IS NULL
      AND "attempts"."correction_mistake_id" IS NOT NULL
      AND "attempts"."correction_item_id" IS NOT NULL
    )
  );