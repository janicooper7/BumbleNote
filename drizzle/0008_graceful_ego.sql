ALTER TABLE "tutors" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tutors" ADD CONSTRAINT "tutors_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "tutors" ADD CONSTRAINT "tutors_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");