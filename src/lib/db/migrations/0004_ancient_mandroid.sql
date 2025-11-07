CREATE TABLE "grouping_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"participant_id" uuid,
	"old_ranking_hash" text,
	"new_ranking_hash" text,
	"trigger_metadata" jsonb,
	"should_trigger_grouping" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grouping_events" ADD CONSTRAINT "grouping_events_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_events" ADD CONSTRAINT "grouping_events_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grouping_events_quiz_created_idx" ON "grouping_events" USING btree ("quiz_id","created_at");--> statement-breakpoint
CREATE INDEX "grouping_events_type_idx" ON "grouping_events" USING btree ("event_type");