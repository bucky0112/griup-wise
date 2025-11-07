CREATE TABLE "grouping_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"strategy" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "grouping_run_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "grouping_runs" ADD CONSTRAINT "grouping_runs_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_runs" ADD CONSTRAINT "grouping_runs_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_grouping_run_id_grouping_runs_id_fk" FOREIGN KEY ("grouping_run_id") REFERENCES "public"."grouping_runs"("id") ON DELETE cascade ON UPDATE no action;