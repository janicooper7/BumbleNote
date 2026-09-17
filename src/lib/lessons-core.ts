// Next-free lesson-creation core. Server-only, but crucially imports NOTHING from
// `next/*` — so it can be bundled into the standalone Netlify background worker
// (netlify/functions/process.mts) without dragging in `next/cache`, which isn't
// resolvable outside the Next.js runtime and crashes the function at import time.
//
// The Next.js callers use `createDraftLesson` from ./lessons (which wraps this and
// calls revalidatePath); the worker imports `createDraftLessonCore` from here.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, students, tutors } from "@/db/schema";
import { generateLessonFeedback } from "@/lib/ai";
import { buildJourney, journeyPromptBlock } from "@/lib/journey";
import { countsAsLesson } from "@/lib/plans";
import { insertWithUniqueId } from "@/lib/unique-id";

export type CreateDraftLessonInput = {
  studentId: string;
  transcript: string;
  durationMin: number;
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

  // Global primary key, so uniqueness spans every tutor — see src/lib/unique-id.ts.
  const id = await insertWithUniqueId(`s-${student.id}-${lessonNo}`, (candidateId) =>
    db.insert(sessions).values({
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
    }),
  );

  // Feeds the free trial's lifetime limit (src/lib/quota.ts). Counted only once
  // the lesson exists, so an upload that fails before this point doesn't use up
  // the tutor's trial allowance — and only for a recording long enough to be a lesson.
  if (countsAsLesson(durationMin)) {
    await db
      .update(tutors)
      .set({ lessonsCreated: sql`${tutors.lessonsCreated} + 1` })
      .where(eq(tutors.id, tutorId));
  }

  return { id };
}
