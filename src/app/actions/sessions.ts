"use server";

// Server Actions for session mutations. Scoped to the current tutor and
// revalidate the dashboard subtree so Server Components re-read fresh data.

import { and, eq, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sessionAttachments, sessions, tutors } from "@/db/schema";
import { currentTutorId } from "@/auth";
import { getSessionById, getStudentById } from "@/db/queries";
import { renderLessonReportPDF } from "@/lib/pdf";
import { sendLessonReportEmail } from "@/lib/email";
import {
  MAX_ATTACHMENT_TOTAL_BYTES,
  formatBytes,
  isAllowedAttachment,
  type AttachmentMeta,
} from "@/lib/attachments";
import type { SessionStatus, VocabItem } from "@/lib/mock";

export type AttachmentResult =
  | { ok: true; attachment: AttachmentMeta }
  | { ok: false; error: string };

/**
 * Attach a file to a lesson report. Stored straight away (not held until send)
 * so it survives "Save draft" and a page reload like the rest of the edits.
 * Returns errors instead of throwing for the same reason sendLessonReport does:
 * production Next.js hides thrown messages, and "that file is too big" is
 * exactly what the tutor needs to read.
 */
export async function uploadSessionAttachment(
  sessionId: string,
  formData: FormData,
): Promise<AttachmentResult> {
  const tutorId = await currentTutorId();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to attach." };
  }
  if (!isAllowedAttachment(file.name)) {
    return {
      ok: false,
      error: "That file type can't be attached. Use a document, spreadsheet, image or audio file.",
    };
  }

  const [session] = await db
    .select({ status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!session) return { ok: false, error: "Lesson not found." };
  if (session.status === "sent") {
    return { ok: false, error: "This report has already been sent." };
  }

  const [{ used }] = await db
    .select({ used: sum(sessionAttachments.size) })
    .from(sessionAttachments)
    .where(
      and(eq(sessionAttachments.tutorId, tutorId), eq(sessionAttachments.sessionId, sessionId)),
    );
  const usedBytes = Number(used ?? 0);
  if (usedBytes + file.size > MAX_ATTACHMENT_TOTAL_BYTES) {
    const left = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - usedBytes);
    return {
      ok: false,
      error: `Attachments are limited to ${formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} per lesson — ${formatBytes(left)} left, and ${file.name} is ${formatBytes(file.size)}.`,
    };
  }

  const [row] = await db
    .insert(sessionAttachments)
    .values({
      tutorId,
      sessionId,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    })
    .returning({
      id: sessionAttachments.id,
      filename: sessionAttachments.filename,
      size: sessionAttachments.size,
    });
  return { ok: true, attachment: row };
}

export async function deleteSessionAttachment(
  sessionId: string,
  attachmentId: string,
): Promise<void> {
  const tutorId = await currentTutorId();
  const [session] = await db
    .select({ status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, sessionId)))
    .limit(1);
  // A sent report's attachments are part of what the student received.
  if (!session || session.status === "sent") return;
  await db
    .delete(sessionAttachments)
    .where(
      and(
        eq(sessionAttachments.tutorId, tutorId),
        eq(sessionAttachments.sessionId, sessionId),
        eq(sessionAttachments.id, attachmentId),
      ),
    );
}

export async function setSessionStatus(id: string, status: SessionStatus): Promise<void> {
  const tutorId = await currentTutorId();
  await db
    .update(sessions)
    .set({ status })
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)));
  revalidatePath("/dashboard", "layout");
}

export async function setSessionTitle(id: string, title: string): Promise<void> {
  const tutorId = await currentTutorId();
  const trimmed = title.trim();
  if (!trimmed) return;
  await db
    .update(sessions)
    .set({ title: trimmed })
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)));
  revalidatePath("/dashboard", "layout");
}

/**
 * Permanently delete a session (e.g. a bad recording the tutor doesn't want to
 * keep). Scoped to the current tutor so one tutor can't delete another's rows,
 * then redirects back to the dashboard since the review page no longer exists.
 */
export async function deleteSession(id: string): Promise<void> {
  const tutorId = await currentTutorId();
  await db
    .delete(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)));
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

// The editable feedback fields on a session (talkTime + observedLevel are AI
// output and not tutor-editable, so they're excluded).
export type SessionFeedbackInput = {
  vocab: VocabItem[];
  wentWell: string[];
  focus: string[];
  homework: string;
  additionalInfo: string;
  nextLesson: string[];
  lessonEndedAt: string;
  tutorNotes: string;
};

/** Persist all edited feedback fields and set the session's status in one write. */
export async function saveSessionFeedback(
  id: string,
  data: SessionFeedbackInput,
  status: SessionStatus,
): Promise<void> {
  const tutorId = await currentTutorId();
  await db
    .update(sessions)
    .set({ ...data, status })
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)));
  revalidatePath("/dashboard", "layout");
}

/**
 * Confirm & send: persist the edited feedback, then generate the lesson-report
 * PDF and email it to the student. Edits are saved as "confirmed" first, so a
 * delivery failure (missing email, bad key) never leaves the lesson falsely
 * marked "sent" — the tutor can fix the cause and retry.
 */
export type SendLessonReportResult = { ok: true } | { ok: false; error: string };

/**
 * Render the report PDF from what's stored and email it to the student, with
 * any attachments still on file. Throws with a tutor-readable message.
 */
async function deliverLessonReport(
  tutorId: string,
  id: string,
): Promise<{ attachmentCount: number }> {
  const session = await getSessionById(id);
  if (!session) throw new Error("Lesson not found.");
  const student = await getStudentById(session.studentId);
  if (!student) throw new Error("Student not found.");
  if (!student.email) {
    throw new Error(`Add an email address for ${student.name} before sending.`);
  }

  const [tutor] = await db
    .select({ name: tutors.name })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  const tutorName = tutor?.name ?? "Your tutor";

  const attachments = await db
    .select({
      filename: sessionAttachments.filename,
      contentType: sessionAttachments.contentType,
      data: sessionAttachments.data,
    })
    .from(sessionAttachments)
    .where(and(eq(sessionAttachments.tutorId, tutorId), eq(sessionAttachments.sessionId, id)))
    .orderBy(sessionAttachments.createdAt);

  const pdf = await renderLessonReportPDF(session, student, { tutorName });
  await sendLessonReportEmail({
    to: student.email,
    studentName: student.name,
    tutorName,
    session,
    pdf,
    attachments,
  });
  return { attachmentCount: attachments.length };
}

/**
 * Email an already-sent report again (e.g. the student lost it, or their email
 * address was corrected). Sends the stored report as-is — no edits, no status
 * change. Attachments were deleted after the first send, so only the PDF goes.
 */
export async function resendLessonReport(id: string): Promise<SendLessonReportResult> {
  const tutorId = await currentTutorId();
  try {
    const [row] = await db
      .select({ status: sessions.status })
      .from(sessions)
      .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)))
      .limit(1);
    if (!row) throw new Error("Lesson not found.");
    if (row.status !== "sent") throw new Error("Send the report before resending it.");
    await deliverLessonReport(tutorId, id);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't resend the report.",
    };
  }
}

export async function sendLessonReport(
  id: string,
  data: SessionFeedbackInput,
): Promise<SendLessonReportResult> {
  const tutorId = await currentTutorId();

  await db
    .update(sessions)
    .set({ ...data, status: "confirmed" })
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)));

  try {
    const { attachmentCount } = await deliverLessonReport(tutorId, id);

    await db
      .update(sessions)
      .set({ status: "sent" })
      .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)));

    // The student now has the files in their inbox; our copy has no further use.
    // Best-effort — if this fails, the daily retention sweep removes them anyway.
    if (attachmentCount) {
      await db
        .delete(sessionAttachments)
        .where(and(eq(sessionAttachments.tutorId, tutorId), eq(sessionAttachments.sessionId, id)))
        .catch((err) => console.error("[send] couldn't delete attachments:", err));
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (err) {
    // Return the real reason instead of throwing: Next.js sanitizes thrown
    // server-action messages in production to a generic 500, hiding exactly the
    // detail the tutor needs ("add an email", "verify a domain", etc.). The row
    // stays "confirmed" (saved but not sent), so the tutor can fix it and retry.
    revalidatePath("/dashboard", "layout");
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't send the report.",
    };
  }
}
