CREATE TABLE "credit_grants" (
	"tutor_id" uuid NOT NULL,
	"month" date NOT NULL,
	"lessons" integer NOT NULL,
	"carried_in" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_grants_tutor_id_month_pk" PRIMARY KEY("tutor_id","month")
);
--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "credits_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "pause_resumes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "pending_plan" "tutor_plan";--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "pending_plan_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Existing subscribers start their rollover bank at the start of this month, so
-- this month's allowance is exactly what it was before; carrying over begins at
-- the next month.
UPDATE "tutors" SET "credits_since" = date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
WHERE "subscription_status" IN ('active', 'trialing', 'past_due') AND "plan" IN ('starter', 'advanced', 'pro');
