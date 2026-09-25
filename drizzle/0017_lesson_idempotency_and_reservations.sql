CREATE TABLE "lesson_reservations" (
	"upload_id" text PRIMARY KEY NOT NULL,
	"tutor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "upload_id" text;--> statement-breakpoint
ALTER TABLE "lesson_reservations" ADD CONSTRAINT "lesson_reservations_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_reservations_tutor_idx" ON "lesson_reservations" USING btree ("tutor_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_upload_id_unique" UNIQUE("upload_id");