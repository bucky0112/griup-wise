ALTER TABLE "classes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "deleted_at" timestamp with time zone;