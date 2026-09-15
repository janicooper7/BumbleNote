"use server";

// Combine the recordings of an interrupted lesson into one lesson. Rules shared
// with the review screen live in src/lib/merge.ts.

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sessionAttachments, sessions, students, tutors } from "@/db/schema";
import { currentTutorId } from "@/auth";
import { mergeLessonFeedback } from "@/lib/ai";
import { MAX_ATTACHMENT_TOTAL_BYTES, formatBytes } from "@/lib/attachments";
import {
  MAX_MERGE_PARTS,
  MERGE_WINDOW_HOURS,
  lessonNumberPrefix,
  weightedTalkTime,
  type MergeCandidate,
} from "@/lib/merge";
import { countsAsLesson } from "@/lib/plans";

export type MergeSessionsResult = { ok: true; id: string } | { ok: false; error: string };

/** How many recent lessons the sidebar's "Combine lessons" dialog lists. */
const MERGEABLE_LIST_LIMIT = 30;

/**
 * One student's unsent lessons, newest first — what the sidebar's "Combine
 * lessons" dialog offers once a student is picked. Scoped to a single student so
 * lessons of different students can never be offered side by side.
 */
export async function getMergeableLessons(studentId: string): Promise<MergeCandidate[]> {
  const tutorId = await currentTutorId();
  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      durationMin: sessions.durationMin,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.tutorId, tutorId),
        eq(sessions.studentId, studentId),
        ne(sessions.status, "sent"),
      ),
    )
    .orderBy(desc(sessions.createdAt))
    .limit(MERGEABLE_LIST_LIMIT);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/**
 * Merge 2–MAX_MERGE_PARTS unsent lessons of the same student into one draft.
 *
 * The earliest part is rewritten in place — it keeps its id, lesson number,
 * date and created_at (so the credit lands in the month the lesson was taught)
 * — and the later parts are deleted, their attachments moving across.
 *
 * Credits: the combined lesson uses exactly one if it's long enough to count
 * (countsAsLesson), none otherwise, whatever the parts used between them. For
 * monthly plans that falls out of the row count; the trial's lifetime counter is
 * adjusted by the difference.
 *
 * Returns errors rather than throwing: production Next.js hides thrown messages.
 */
export async function mergeSessions(ids: string[]): Promise<MergeSessionsResult> {
  const tutorId = await currentTutorId();
  const unique = [...new Set(ids)];
  if (unique.length < 2) return { ok: false, error: "Pick at least two recordings to combine." };
  if (unique.length > MAX_MERGE_PARTS) {
    return { ok: false, error: `You can combine up to ${MAX_MERGE_PARTS} recordings at once.` };
  }

  try {
    const parts = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tutorId, tutorId), inArray(sessions.id, unique)))
      .orderBy(sessions.createdAt);

    if (parts.length !== unique.length) {
      return { ok: false, error: "One of those lessons no longer exists — refresh and try again." };
    }
    if (parts.some((p) => p.studentId !== parts[0].studentId)) {
      return { ok: false, error: "Only recordings of the same student can be combined." };
    }
    if (parts.some((p) => p.status === "sent")) {
      return { ok: false, error: "A lesson that has already been sent can't be combined." };
    }
    const spanMs = parts[parts.length - 1].createdAt.getTime() - parts[0].createdAt.getTime();
    if (spanMs > MERGE_WINDOW_HOURS * 3_600_000) {
      return {
        ok: false,
        error: `Only recordings made within ${MERGE_WINDOW_HOURS} hours of each other can be combined.`,
      };
    }

    const [first, ...rest] = parts;
    const restIds = rest.map((p) => p.id);

    const [{ bytes }] = await db
      .select({ bytes: sql<number>`coalesce(sum(${sessionAttachments.size}), 0)::int` })
      .from(sessionAttachments)
      .where(
        and(eq(sessionAttachments.tutorId, tutorId), inArray(sessionAttachments.sessionId, unique)),
      );
    if (bytes > MAX_ATTACHMENT_TOTAL_BYTES) {
      return {
        ok: false,
        error: `Together these lessons have ${formatBytes(bytes)} of attachments, over the ${formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} limit. Remove some files first.`,
      };
    }

    const [student] = await db
      .select()
      .from(students)
      .where(and(eq(students.tutorId, tutorId), eq(students.id, first.studentId)))
      .limit(1);
    if (!student) return { ok: false, error: "Student not found." };

    const feedback = await mergeLessonFeedback(parts, {
      studentName: student.name,
      native: student.native,
      level: student.level,
      goal: student.goal,
    });

    const durationMin = parts.reduce((n, p) => n + p.durationMin, 0);
    const creditDelta =
      (countsAsLesson(durationMin) ? 1 : 0) - parts.filter((p) => countsAsLesson(p.durationMin)).length;

    // One round-trip, applied atomically: a half-done merge would either lose a
    // part's attachments or leave the parts and the combined lesson side by side.
    // If the first part was sent from another tab during the (slow) Claude call,
    // its rewrite matches nothing — and every later statement is gated on it, so
    // the other parts aren't deleted into a lesson that was never rewritten.
    const firstStillOpen = sql`exists (select 1 from ${sessions} where ${sessions.id} = ${first.id} and ${sessions.status} <> 'sent')`;
    const [updated] = await db.batch([
      db
        .update(sessions)
        .set({
          title: `${lessonNumberPrefix(first.title)} · ${feedback.topic}`,
          durationMin,
          status: "draft",
          observedLevel: feedback.observedLevel,
          talkTime: weightedTalkTime(parts),
          vocab: feedback.vocab,
          wentWell: feedback.wentWell,
          focus: feedback.focus,
          homework: feedback.homework,
          additionalInfo: feedback.additionalInfo,
          nextLesson: feedback.nextLesson,
          lessonEndedAt: feedback.lessonEndedAt,
          tutorNotes: feedback.tutorNotes,
        })
        .where(
          and(eq(sessions.tutorId, tutorId), eq(sessions.id, first.id), ne(sessions.status, "sent")),
        )
        .returning({ id: sessions.id }),
      db
        .update(sessionAttachments)
        .set({ sessionId: first.id })
        .where(
          and(
            eq(sessionAttachments.tutorId, tutorId),
            inArray(sessionAttachments.sessionId, restIds),
            firstStillOpen,
          ),
        ),
      db
        .delete(sessions)
        .where(
          and(
            eq(sessions.tutorId, tutorId),
            inArray(sessions.id, restIds),
            ne(sessions.status, "sent"),
            firstStillOpen,
          ),
        ),
      db
        .update(tutors)
        .set({ lessonsCreated: sql`greatest(${tutors.lessonsCreated} + ${creditDelta}, 0)` })
        .where(and(eq(tutors.id, tutorId), firstStillOpen)),
    ]);

    if (updated.length === 0) {
      return { ok: false, error: "That lesson changed while combining — refresh and try again." };
    }

    revalidatePath("/dashboard", "layout");
    return { ok: true, id: first.id };
  } catch (err) {
    console.error("[merge] failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't combine the recordings.",
    };
  }
}
