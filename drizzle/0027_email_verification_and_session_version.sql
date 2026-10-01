ALTER TABLE "tutors" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Rows with no password can only have come from Google sign-in, which verifies
-- the address. Password rows stay unproven until a Google sign-in or a reset.
UPDATE "tutors" SET "email_verified_at" = "created_at" WHERE "password_hash" IS NULL;
