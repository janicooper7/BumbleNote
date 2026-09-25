CREATE INDEX "session_attachments_session_idx" ON "session_attachments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_tutor_created_idx" ON "sessions" USING btree ("tutor_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_student_idx" ON "sessions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "students_tutor_idx" ON "students" USING btree ("tutor_id");