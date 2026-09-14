ALTER TABLE "tutors" ADD COLUMN "lessons_created" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
--> Backfill from the lessons that still exist, so a free tutor who has already
--> had a lesson processed doesn't get a fresh trial. Lessons deleted before this
--> migration can't be counted — an accepted, one-off gap.
UPDATE "tutors" SET "lessons_created" = (
  SELECT count(*) FROM "sessions" WHERE "sessions"."tutor_id" = "tutors"."id"
);
