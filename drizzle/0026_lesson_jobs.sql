CREATE TABLE "lesson_jobs" (
	"upload_id" text PRIMARY KEY NOT NULL,
	"tutor_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"duration_min" integer NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"touched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_jobs" ADD CONSTRAINT "lesson_jobs_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_jobs_tutor_idx" ON "lesson_jobs" USING btree ("tutor_id");--> statement-breakpoint
CREATE INDEX "lesson_jobs_state_idx" ON "lesson_jobs" USING btree ("state","queued_at");