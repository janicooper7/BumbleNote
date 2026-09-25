// Finalize a chunked upload: validate the student, record the authoritative job,
// and kick the background worker (netlify/functions/process.mts) that transcribes
// and drafts the lesson. Returns immediately — the client then polls
// /api/upload/status. Auth: session (web) or Bearer capture token (extension).

import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { students } from "@/db/schema";
import { env } from "@/lib/env";
import { resolveTutorId } from "@/lib/upload-auth";
import { isQuotaError, releaseLesson, reserveLesson } from "@/lib/quota";
import { parseTrimMap } from "@/lib/trim-map-validation";
import {
  uploadStore,
  jobKey,
  statusKey,
  type TrimMaps,
  type UploadJob,
  type UploadStatus,
} from "@/lib/upload-store";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  const tutorId = await resolveTutorId(req);
  if (!tutorId) return json({ error: "Unauthorized." }, 401);

  let body: {
    uploadId?: string;
    studentId?: string;
    durationMin?: number;
    isTrial?: boolean;
    parts?: { student?: number; tutor?: number };
    trimMaps?: { student?: unknown; tutor?: unknown };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }

  const uploadId = String(body.uploadId ?? "");
  const studentId = String(body.studentId ?? "").trim();
  const durationMin = Number(body.durationMin ?? 45);
  const studentParts = Number(body.parts?.student);
  const tutorParts = Number(body.parts?.tutor);

  if (!ID_RE.test(uploadId)) return json({ error: "Bad uploadId." }, 400);
  if (!studentId) return json({ error: "Missing studentId." }, 400);
  if (!Number.isInteger(studentParts) || studentParts < 1) {
    return json({ error: "No student audio was uploaded." }, 400);
  }
  if (!Number.isInteger(tutorParts) || tutorParts < 1) {
    return json({ error: "No tutor audio was uploaded." }, 400);
  }

  let trimMaps: TrimMaps | undefined;
  try {
    const student = parseTrimMap(body.trimMaps?.student, "student");
    const tutor = parseTrimMap(body.trimMaps?.tutor, "tutor");
    if (student || tutor) trimMaps = { student, tutor };
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Bad trim map." }, 400);
  }

  // Validate the student up front so a bad id doesn't burn a paid transcription.
  const [studentRow] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tutorId, tutorId), eq(students.id, studentId)))
    .limit(1);
  if (!studentRow) return json({ error: "Student not found." }, 404);

  const store = uploadStore();

  // A resumed upload (see lib/pending-uploads) can reach here a second time — the
  // first /complete succeeded but its response never made it back. Kicking the
  // worker again would transcribe and draft the lesson twice, so a job that is
  // already running or done just answers as if it had been accepted now. A job
  // whose start failed (error status) falls through and is started again.
  const existing = (await store.get(statusKey(uploadId), {
    type: "json",
    consistency: "strong",
  })) as UploadStatus | null;
  if (existing && existing.state !== "error") return json({ uploadId });

  // Last gate before the worker starts spending on Deepgram + Anthropic. Holds a
  // credit for this upload until the worker writes the lesson or fails, so
  // parallel uploads can't all squeeze through on the same remaining credit.
  // Placed after the resume check above: a job already running holds its own.
  try {
    await reserveLesson(tutorId, uploadId);
  } catch (err) {
    if (isQuotaError(err)) return json({ error: err.message, quota: true }, 402);
    throw err;
  }

  const job: UploadJob = {
    tutorId,
    studentId,
    durationMin: Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 45,
    isTrial: body.isTrial === true,
    parts: { student: studentParts, tutor: tutorParts },
    trimMaps,
    startedAt: Date.now(),
  };
  const processing: UploadStatus = { state: "processing" };
  await Promise.all([
    store.setJSON(jobKey(uploadId), job),
    store.setJSON(statusKey(uploadId), processing),
  ]);

  // Kick the background function at its canonical URL. It returns 202 immediately
  // and keeps running detached, so awaiting this is fast and just confirms the
  // trigger was accepted. If it's unreachable (e.g. not deployed → 404), surface
  // that as an error status instead of leaving the client polling forever.
  try {
    const res = await fetch(`${req.nextUrl.origin}/.netlify/functions/process`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": env.INTERNAL_TASK_SECRET,
      },
      body: JSON.stringify({ uploadId }),
    });
    if (!res.ok && res.status !== 202) {
      throw new Error(`Processing worker returned ${res.status}.`);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Couldn't start processing.";
    await Promise.all([
      store.setJSON(statusKey(uploadId), { state: "error", error } satisfies UploadStatus),
      releaseLesson(uploadId),
    ]);
    return json({ error }, 502);
  }

  return json({ uploadId });
}
