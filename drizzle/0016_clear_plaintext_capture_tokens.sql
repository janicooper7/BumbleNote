-- capture_token now holds a SHA-256 of the token (src/lib/capture-auth.ts).
-- Nothing in the app issues tokens while the extension is paused, so any value
-- still here is a legacy plaintext token: it can no longer authenticate, and
-- keeping it would leave a live credential sitting in the database. Clear them.
UPDATE "tutors" SET "capture_token" = NULL WHERE "capture_token" IS NOT NULL;
