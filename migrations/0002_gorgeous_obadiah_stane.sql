CREATE TABLE "homework_confirmations" (
	"id" text PRIMARY KEY NOT NULL,
	"problem_id" text NOT NULL,
	"student_id" text NOT NULL,
	"corrections" jsonb NOT NULL,
	"confirmer_role" text NOT NULL,
	"policy_version" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_problems" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"student_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"extraction" jsonb NOT NULL,
	"trust_policy_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"source_sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"schema_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "source_kind" text DEFAULT 'PRACTICE' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "homework_submission_id" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "homework_problem_id" text;--> statement-breakpoint
ALTER TABLE "homework_confirmations" ADD CONSTRAINT "homework_confirmations_problem_id_homework_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."homework_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_confirmations" ADD CONSTRAINT "homework_confirmations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_problems" ADD CONSTRAINT "homework_problems_submission_id_homework_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."homework_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_problems" ADD CONSTRAINT "homework_problems_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_confirmation_problem_order_idx" ON "homework_confirmations" USING btree ("problem_id","confirmed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_problem_submission_sequence_uq" ON "homework_problems" USING btree ("submission_id","sequence");--> statement-breakpoint
CREATE INDEX "homework_problem_submission_order_idx" ON "homework_problems" USING btree ("submission_id","sequence","id");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_submission_student_hash_uq" ON "homework_submissions" USING btree ("student_id","source_sha256");--> statement-breakpoint
CREATE INDEX "homework_submission_student_order_idx" ON "homework_submissions" USING btree ("student_id","created_at","id");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_homework_submission_id_homework_submissions_id_fk" FOREIGN KEY ("homework_submission_id") REFERENCES "public"."homework_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_homework_problem_id_homework_problems_id_fk" FOREIGN KEY ("homework_problem_id") REFERENCES "public"."homework_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_homework_problem_order_idx" ON "attempts" USING btree ("homework_problem_id","submitted_at","id");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempt_source_coordinates_ck" CHECK (
    (
      "attempts"."source_kind" = 'PRACTICE'
      AND "attempts"."session_id" IS NOT NULL
      AND "attempts"."item_id" IS NOT NULL
      AND "attempts"."homework_submission_id" IS NULL
      AND "attempts"."homework_problem_id" IS NULL
    ) OR (
      "attempts"."source_kind" = 'HOMEWORK'
      AND "attempts"."session_id" IS NULL
      AND "attempts"."item_id" IS NULL
      AND "attempts"."homework_submission_id" IS NOT NULL
      AND "attempts"."homework_problem_id" IS NOT NULL
    )
  );