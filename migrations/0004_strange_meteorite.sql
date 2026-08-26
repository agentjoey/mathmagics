CREATE TABLE "adaptive_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"source_lesson_id" text NOT NULL,
	"action" text NOT NULL,
	"selected_intent" text NOT NULL,
	"selected_objective_ids" jsonb NOT NULL,
	"target_mistake_id" text,
	"rationale_codes" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"input_fact_cutoff" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_supersessions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"source_lesson_id" text NOT NULL,
	"replacement_lesson_id" text NOT NULL,
	"adaptive_decision_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"type" text NOT NULL,
	"interaction_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref_id" text NOT NULL,
	"interaction_type" text NOT NULL,
	"outcome" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "daily_lesson_plan_sequence_uq";--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_source_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("source_lesson_id") REFERENCES "public"."daily_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_decisions" ADD CONSTRAINT "adaptive_decisions_target_mistake_id_mistakes_id_fk" FOREIGN KEY ("target_mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_supersessions" ADD CONSTRAINT "lesson_supersessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_supersessions" ADD CONSTRAINT "lesson_supersessions_source_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("source_lesson_id") REFERENCES "public"."daily_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_supersessions" ADD CONSTRAINT "lesson_supersessions_replacement_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("replacement_lesson_id") REFERENCES "public"."daily_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_supersessions" ADD CONSTRAINT "lesson_supersessions_adaptive_decision_id_adaptive_decisions_id_fk" FOREIGN KEY ("adaptive_decision_id") REFERENCES "public"."adaptive_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_evidence" ADD CONSTRAINT "strategy_evidence_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_evidence" ADD CONSTRAINT "strategy_evidence_interaction_id_strategy_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."strategy_interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_interactions" ADD CONSTRAINT "strategy_interactions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "adaptive_decision_evaluation_key_uq" ON "adaptive_decisions" USING btree ("student_id","source_lesson_id","input_fact_cutoff","policy_version");--> statement-breakpoint
CREATE INDEX "adaptive_decision_source_order_idx" ON "adaptive_decisions" USING btree ("source_lesson_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_supersession_source_uq" ON "lesson_supersessions" USING btree ("source_lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_supersession_replacement_uq" ON "lesson_supersessions" USING btree ("replacement_lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_supersession_decision_uq" ON "lesson_supersessions" USING btree ("adaptive_decision_id");--> statement-breakpoint
CREATE INDEX "lesson_supersession_student_order_idx" ON "lesson_supersessions" USING btree ("student_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_evidence_interaction_uq" ON "strategy_evidence" USING btree ("interaction_id");--> statement-breakpoint
CREATE INDEX "strategy_evidence_student_order_idx" ON "strategy_evidence" USING btree ("student_id","observed_at","recorded_at","id");--> statement-breakpoint
CREATE INDEX "strategy_evidence_student_strategy_idx" ON "strategy_evidence" USING btree ("student_id","strategy_id","observed_at","id");--> statement-breakpoint
CREATE INDEX "strategy_interaction_student_order_idx" ON "strategy_interactions" USING btree ("student_id","observed_at","recorded_at","id");--> statement-breakpoint
CREATE INDEX "strategy_interaction_student_strategy_idx" ON "strategy_interactions" USING btree ("student_id","strategy_id","observed_at","id");--> statement-breakpoint
CREATE INDEX "daily_lesson_plan_sequence_idx" ON "daily_lessons" USING btree ("weekly_plan_id","sequence","created_at","id");