ALTER TABLE "tutors" ADD COLUMN "nudge_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "check_in_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "first_recap_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "stuck_reason" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "stuck_reason_at" timestamp with time zone;--> statement-breakpoint
-- Accounts that exist before these emails ship don't get them retroactively
-- (as in 0028): they're test accounts, or signed up long before launch.
UPDATE "tutors" SET "nudge_sent_at" = now(), "check_in_sent_at" = now(), "first_recap_sent_at" = now();
