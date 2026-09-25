ALTER TABLE "credit_grants" ADD COLUMN "period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "billing_anchor" timestamp with time zone;--> statement-breakpoint
-- Existing grants were calendar months: each period started on the 1st (UTC).
UPDATE "credit_grants" SET "period_start" = "month"::timestamp AT TIME ZONE 'UTC';
