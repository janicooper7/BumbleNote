ALTER TABLE "tutors" ALTER COLUMN "plan" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tutors" ALTER COLUMN "plan" SET DEFAULT 'free'::text;--> statement-breakpoint
--> Repricing (Sept 2026): Starter 30 / Advanced 75 / Pro 130, and "Unlimited"
--> is retired. Remap while the column is plain text so the cast below can't hit
--> a value the new enum lacks. Every mapping lands on an equal-or-higher cap, so
--> no existing tutor is newly limited: unlimited (250) -> legacy (250),
--> starter (40) -> advanced (75), pro (120) -> pro (130).
UPDATE "tutors" SET "plan" = CASE "plan"
  WHEN 'unlimited' THEN 'legacy'
  WHEN 'starter' THEN 'advanced'
  ELSE "plan"
END;--> statement-breakpoint
DROP TYPE "public"."tutor_plan";--> statement-breakpoint
CREATE TYPE "public"."tutor_plan" AS ENUM('free', 'starter', 'advanced', 'pro', 'legacy');--> statement-breakpoint
ALTER TABLE "tutors" ALTER COLUMN "plan" SET DEFAULT 'free'::"public"."tutor_plan";--> statement-breakpoint
ALTER TABLE "tutors" ALTER COLUMN "plan" SET DATA TYPE "public"."tutor_plan" USING "plan"::"public"."tutor_plan";
