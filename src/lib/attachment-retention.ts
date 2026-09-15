// Deletes lesson-report attachments once they've outlived ATTACHMENT_RETENTION_DAYS.
//
// Sending a report already deletes its files (sendLessonReport). This catches the
// rest: drafts never sent, and any delete that failed after a send. Aged from
// upload. Run by the daily sweep in netlify/functions/purge-uploads.mts.
//
// Next-free by design, like upload-retention.ts — the scheduled function bundles
// this directly.

import { lt } from "drizzle-orm";
import { db } from "@/db";
import { sessionAttachments } from "@/db/schema";
import { ATTACHMENT_RETENTION_DAYS } from "./attachments";

export async function purgeExpiredAttachments(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - ATTACHMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(sessionAttachments)
    .where(lt(sessionAttachments.createdAt, cutoff))
    .returning({ id: sessionAttachments.id });
  return deleted.length;
}
