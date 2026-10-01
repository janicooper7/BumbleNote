ALTER TABLE "tutors" ADD COLUMN "welcome_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "trial_ended_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "marketing_opt_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "email_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "live_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "benefits_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD CONSTRAINT "tutors_email_token_unique" UNIQUE("email_token");--> statement-breakpoint
-- Accounts that exist before these emails ship don't get them retroactively:
-- they signed up long ago, or already used their trial.
UPDATE "tutors" SET "welcome_sent_at" = "created_at";--> statement-breakpoint
UPDATE "tutors" SET "trial_ended_sent_at" = now() WHERE "lessons_created" >= 2;
