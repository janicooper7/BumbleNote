CREATE TABLE "meta_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"tutor_id" uuid,
	"event_name" text NOT NULL,
	"value" numeric(10, 2),
	"currency" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "utm_content" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "utm_term" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "fbclid" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "landing_page" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "first_touch_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "signup_country" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "ad_consent" boolean;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "ad_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "meta_fbp" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "meta_fbc" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "meta_client_ip" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "meta_client_ua" text;--> statement-breakpoint
ALTER TABLE "meta_events" ADD CONSTRAINT "meta_events_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_events_tutor_idx" ON "meta_events" USING btree ("tutor_id","event_name");