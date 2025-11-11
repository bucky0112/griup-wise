ALTER TABLE "answers" ADD COLUMN "review_status" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "review_feedback" text;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "manual_score" numeric;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "response_format" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "expected_language" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "grading_instructions" text;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_reviewed_by_admins_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;