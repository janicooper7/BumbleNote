// Next-free lesson-creation core. Server-only, but crucially imports NOTHING from
// `next/*` — so it can be bundled into the standalone Netlify background worker
// (netlify/functions/process.mts) without dragging in `next/cache`, which isn't
// resolvable outside the Next.js runtime and crashes the function at import time.
//
// The Next.js callers use `createDraftLesson` from ./lessons (which wraps this and
// calls revalidatePath); the worker imports `createDraftLessonCore` from here.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonReservations, sessions, students, tutors } from "@/db/schema";
import { generateLessonFeedback } from "@/lib/ai";
import { buildJourney, journeyPromptBlock } from "@/lib/journey";
import { countsAsLesson } from "@/lib/plans";
import { insertWithUniqueId } from "@/lib/unique-id";

export type CreateDraftLessonInput = {
  /**
   * Identifies the recording being drafted: the chunked upload's id, or a one-off
   * id minted by a synchronous caller. It is both the idempotency key (at most one
   * lesson per id — sessions.upload_id is unique) and the id of the lesson credit
   * held for it (lib/quota reserveLesson), which writing the lesson consumes.
   */
  uploadId: string;
  studentId: string;
  transcript: string;
  durationMin: number;
  /** Marked by the tutor as this student's trial/introductory lesson. */
  isTrial?: boolean;
};

/** Split a student's "B1 → B2" level into from/to, tolerant of odd input. */
function splitLevel(level: string): { from: string; to: string } {
  const parts = level.split(/→|->/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { from: parts[0], to: parts[1] };
  const only = parts[0] ?? level.trim();
  return { from: only, to: only };
}

/**
 * Insert a draft lesson — the Next-free core. Does everything except
 * `revalidatePath`, so it can run inside a raw Netlify background function (where
 * `next/cache` has no request context and would throw). Next.js callers should
 * use `createDraftLesson` (./lessons), which wraps this and revalidates the cache.
 */
export async function createDraftLessonCore(
  tutorId: string,
  input: CreateDraftLessonInput,
): Promise<{ id: string }> {
  const transcript = input.transcript.trim();
  if (transcript.length < 40) {
    throw new Error("Please paste a fuller lesson transcript.");
  }

  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.tutorId, tutorId), eq(students.id, input.studentId)))
    .limit(1);
  if (!student) throw new Error("Student not found.");

  // Already drafted — a worker retried after the lesson was written but before its
  // status was, or two runs raced. Hand back that lesson rather than paying
  // Claude to write a duplicate.
  const existing = await lessonForUpload(tutorId, input.uploadId);
  if (existing) {
    await db.delete(lessonReservations).where(eq(lessonReservations.uploadId, input.uploadId));
    return existing;
  }

  // Every prior lesson for this student, read once and used twice: it builds the
  // journey handed to Claude, and it numbers this lesson. Only the columns the
  // journey folds are selected — a transcript is never stored, but the vocab and
  // notes of a long-running student still add up.
  const priorSessions = await db
    .select({
      status: sessions.status,
      isoDate: sessions.isoDate,
      observedLevel: sessions.observedLevel,
      vocab: sessions.vocab,
      focus: sessions.focus,
      title: sessions.title,
      lessonEndedAt: sessions.lessonEndedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.studentId, student.id)));

  const feedback = await generateLessonFeedback(transcript, {
    studentName: student.name,
    native: student.native,
    level: student.level,
    goal: student.goal,
    focus: student.focus,
    interests: student.interests ?? undefined,
    // Undefined for a first lesson, which keeps that prompt free of empty headings.
    journey: journeyPromptBlock(buildJourney(priorSessions)),
    isTrial: input.isTrial,
  });

  // Lesson number counts drafts too — the tutor taught the lesson whether or not
  // they have reviewed it yet, so numbering must not jump when one is confirmed.
  const lessonNo = priorSessions.length + 1;

  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);

  const { from, to } = splitLevel(student.level);
  const durationMin =
    Number.isFinite(input.durationMin) && input.durationMin > 0
      ? Math.round(input.durationMin)
      : 45;

  // Written as one transaction: the lesson, the trial counter and the release of
  // the held credit land together or not at all. Otherwise a failure between the
  // insert and the counter would fail the job with its lesson already written.
  //
  // `onConflictDoNothing` on upload_id makes a concurrent duplicate run insert
  // nothing. The counter is bumped in the same statement, off `ins` — i.e. only if
  // THIS insert produced a row. (Checking for "a row with this id and upload" is
  // not enough: the losing run tries the same slug as the winner, and would find
  // the winner's row.) A clash on the slug id alone still throws, and is retried
  // under the next candidate by insertWithUniqueId.
  let inserted = false;
  const id = await insertWithUniqueId(`s-${student.id}-${lessonNo}`, async (candidateId) => {
    const insert = db
      .insert(sessions)
      .values({
        id: candidateId,
        tutorId,
        studentId: student.id,
        studentName: student.name,
        studentInitial: student.initial,
        title: `Lesson ${lessonNo} · ${feedback.topic}`,
        date,
        isoDate,
        durationMin,
        status: "draft",
        levelFrom: from,
        levelTo: to,
        observedLevel: feedback.observedLevel,
        talkTime: feedback.talkTime,
        vocab: feedback.vocab,
        wentWell: feedback.wentWell,
        focus: feedback.focus,
        homework: feedback.homework,
        additionalInfo: feedback.additionalInfo,
        nextLesson: feedback.nextLesson,
        lessonEndedAt: feedback.lessonEndedAt,
        tutorNotes: feedback.tutorNotes,
        isTrial: input.isTrial ?? false,
        uploadId: input.uploadId,
      })
      .onConflictDoNothing({ target: sessions.uploadId })
      .returning({ id: sessions.id });

    // Feeds the free trial's lifetime limit (src/lib/quota.ts). Counted only once
    // the lesson exists, so an upload that fails before this point doesn't use up
    // the tutor's trial allowance — and only for a recording long enough to be a lesson.
    const counts = sql.raw(countsAsLesson(durationMin) ? "true" : "false");

    const [result] = await db.batch([
      db.execute(sql`
        with ins as ${insert},
        bump as (
          update ${tutors} set lessons_created = lessons_created + 1
          where id = ${tutorId} and ${counts} and exists (select 1 from ins)
          returning 1
        )
        select id from ins`),
      db.delete(lessonReservations).where(eq(lessonReservations.uploadId, input.uploadId)),
    ]);
    inserted = result.rows.length > 0;
  });

  if (!inserted) {
    // Another run for this upload won the race; its lesson is the one.
    const winner = await lessonForUpload(tutorId, input.uploadId);
    if (!winner) throw new Error("Lesson insert was skipped but no lesson exists for this upload.");
    return winner;
  }

  // A trial lesson's transcript often has the student introducing themselves —
  // interests, why they're learning, background. Fold that into the profile, but
  // only into fields still empty as of this read: never overwrite something the
  // tutor already typed in.
  if (input.isTrial && feedback.studentProfile) {
    const patch: Partial<typeof students.$inferInsert> = {};
    if ((student.interests?.length ?? 0) === 0 && feedback.studentProfile.interests.length > 0) {
      patch.interests = feedback.studentProfile.interests;
    }
    if (student.focus.length === 0 && feedback.studentProfile.focus.length > 0) {
      patch.focus = feedback.studentProfile.focus;
    }
    if (!student.notes.trim() && feedback.studentProfile.notes.trim()) {
      patch.notes = feedback.studentProfile.notes.trim();
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(students)
        .set(patch)
        .where(and(eq(students.tutorId, tutorId), eq(students.id, student.id)));
    }
  }

  return { id };
}

/** The lesson already drafted from this upload, if any. */
async function lessonForUpload(tutorId: string, uploadId: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.uploadId, uploadId)))
    .limit(1);
  return row ?? null;
}
