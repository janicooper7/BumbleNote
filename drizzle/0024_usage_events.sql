CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"service" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"cost_usd" double precision,
	"meta" jsonb
);
--> statement-breakpoint
CREATE INDEX "usage_events_occurred_at_idx" ON "usage_events" USING btree ("occurred_at");