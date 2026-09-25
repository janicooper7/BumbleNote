ALTER TABLE "credit_grants" DROP CONSTRAINT "credit_grants_tutor_id_month_pk";--> statement-breakpoint
ALTER TABLE "credit_grants" ALTER COLUMN "period_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_tutor_id_period_start_pk" PRIMARY KEY("tutor_id","period_start");--> statement-breakpoint
ALTER TABLE "credit_grants" DROP COLUMN "month";