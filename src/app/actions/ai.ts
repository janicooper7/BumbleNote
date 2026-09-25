"use server";

// AI Server Action: turn a recorded lesson into a fully-formed draft lesson.
// The two audio tracks are transcribed (see src/lib/stt.ts) and Claude generates
// the structured feedback (see src/lib/ai.ts); createDraftLesson wraps it in the
// session fields the DB + review screen expect and inserts it as a "draft" (i.e.
// "needs review") so the tutor lands in the existing review flow.

import { randomUUID } from "node:crypto";
import { currentTutorId } from "@/auth";
import { createDraftLesson } from "@/lib/lessons";
import { releaseLesson, reserveLesson } from "@/lib/quota";
import { transcribeLesson } from "@/lib/stt";

/**
 * In-app "Record this session": take the two recorded tracks (tab audio =
 * student, mic = tutor), transcribe, and draft the lesson in one shot. Session-
 * authed, so no capture token — the tutor is signed in.
 */
export async function createLessonFromAudio(
  formData: FormData,
): Promise<{ id: string }> {
  const tutorId = await currentTutorId();

  const studentId = String(formData.get("studentId") ?? "").trim();
  const durationMin = Number(formData.get("durationMin") ?? 45);
  const student = formData.get("student");
  const tutor = formData.get("tutor");

  if (!studentId) throw new Error("Missing student.");
  if (!(student instanceof File) || !(tutor instanceof File)) {
    throw new Error("The recording came through empty — please try again.");
  }
  if (student.size === 0 || tutor.size === 0) {
    throw new Error("One of the audio tracks was empty — check the tab audio was shared.");
  }

  // Pays for STT and Claude inline, so it holds a lesson credit like every other
  // paid path (src/lib/quota.ts); QuotaError's message is written for the tutor.
  const uploadId = `action-${randomUUID()}`;
  await reserveLesson(tutorId, uploadId);

  try {
    const [studentAudio, tutorAudio] = await Promise.all([
      student.arrayBuffer().then((b) => Buffer.from(b)),
      tutor.arrayBuffer().then((b) => Buffer.from(b)),
    ]);

    const transcript = await transcribeLesson({ studentAudio, tutorAudio });
    return await createDraftLesson(tutorId, { uploadId, studentId, transcript, durationMin });
  } catch (err) {
    await releaseLesson(uploadId);
    throw err;
  }
}
