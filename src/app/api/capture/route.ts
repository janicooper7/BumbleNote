// Capture upload endpoint for the browser extension.
//
// Token-authed (Bearer), not session-authed — the extension runs in its own
// context. Accepts the two lesson audio tracks, transcribes them, generates the
// AI feedback, and creates a draft lesson for the given student. Returns the new
// lesson id + a URL to open it.

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { students } from "@/db/schema";
import { tutorIdByCaptureToken } from "@/lib/capture-auth";
import { transcribeLesson } from "@/lib/stt";
import { createDraftLesson } from "@/lib/lessons";
import { isQuotaError, releaseLesson, reserveLesson } from "@/lib/quota";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  const token = bearer(req);
  const tutorId = token ? await tutorIdByCaptureToken(token) : null;
  if (!tutorId) return json({ error: "Invalid or missing capture token." }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected multipart form data." }, 400);
  }

  const student = form.get("student");
  const tutor = form.get("tutor");
  const studentId = String(form.get("studentId") ?? "").trim();
  const durationMin = Number(form.get("durationMin") ?? 45);

  if (!(student instanceof File) || !(tutor instanceof File)) {
    return json({ error: "Missing student or tutor audio." }, 400);
  }
  if (student.size === 0 || tutor.size === 0) {
    return json({ error: "One of the audio tracks is empty." }, 400);
  }
  if (!studentId) return json({ error: "Missing studentId." }, 400);

  // Validate the student up front so a bad id doesn't burn a paid transcription.
  const [studentRow] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tutorId, tutorId), eq(students.id, studentId)))
    .limit(1);
  if (!studentRow) return json({ error: "Student not found." }, 404);

  // Checked before the audio is read and transcribed — this route pays for STT
  // and the Claude completion inline. The request has no upload id of its own, so
  // it mints one: it keys the held credit, which writing the lesson consumes.
  const uploadId = `capture-${randomUUID()}`;
  try {
    await reserveLesson(tutorId, uploadId);
  } catch (err) {
    if (isQuotaError(err)) return json({ error: err.message, quota: true }, 402);
    throw err;
  }

  try {
    const [studentAudio, tutorAudio] = await Promise.all([
      student.arrayBuffer().then((b) => Buffer.from(b)),
      tutor.arrayBuffer().then((b) => Buffer.from(b)),
    ]);
    const transcript = await transcribeLesson({ studentAudio, tutorAudio });
    const { id } = await createDraftLesson(tutorId, { uploadId, studentId, transcript, durationMin });
    return json({ id, url: `${req.nextUrl.origin}/dashboard/sessions/${id}` });
  } catch (err) {
    await releaseLesson(uploadId);
    return json({ error: err instanceof Error ? err.message : "Processing failed." }, 500);
  }
}
