CREATE TYPE "public"."student_gender" AS ENUM('male', 'female');--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "gender" "student_gender";