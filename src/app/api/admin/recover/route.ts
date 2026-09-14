// Admin recovery for lesson uploads whose background processing failed.
//
// When the worker (netlify/functions/process.mts) errors AFTER the audio has
// been uploaded — e.g. the "fetch failed" on the Claude drafting step for a long
// lesson — it writes a `status: "error"` blob but, crucially, does NOT delete the
// audio chunks (deletion only happens on the success path). So the raw two-track
// audio is still in Netlify Blobs and the whole pipeline can be re-run against it.
//
//   GET  /api/admin/recover   → list failed jobs and whether their audio survives
//   POST /api/admin/recover?uploadId=... → re-fire the worker for that upload
//
// Auth: operators only — an email on the ADMIN_EMAILS allowlist (see
// src/lib/admin.ts). Both handlers are inherently cross-tenant (the listing spans
// every tutor's jobs and exposes their students' names), so gating on "any signed-in
// tutor" would hand every future signup a window into everyone else's data. The
// regenerated draft is always created under the JOB's tutorId
// (createDraftLessonCore), so it lands in the correct tutor's review queue.

import type { NextRequest } from "next/server";
import { currentAdminEmail } from "@/lib/admin";
import { restartProcessing } from "@/lib/failed-lessons";
import { getStudentByIdForTutor } from "@/db/queries";
import {
  uploadStore,
  jobKey,
  statusKey,
  chunkKey,
  type UploadJob,
  type UploadStatus,
  type Parts,
} from "@/lib/upload-store";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** True only if every audio chunk this job expects is still in the store. */
async function audioPresent(
  store: ReturnType<typeof uploadStore>,
  uploadId: string,
  parts: Parts,
): Promise<boolean> {
  for (const track of ["student", "tutor"] as const) {
    for (let i = 0; i < parts[track]; i++) {
      const meta = await store.getMetadata(chunkKey(uploadId, track, i));
      if (!meta) return false;
    }
  }
  return true;
}

/** GET — list jobs that failed (or are stuck processing) and whether audio survives. */
export async function GET(): Promise<Response> {
  if (!(await currentAdminEmail())) return json({ error: "Not found." }, 404);

  const store = uploadStore();
  const { blobs } = await store.list();

  // Every upload writes a `{uploadId}/status` blob — use those as the index.
  const uploadIds = blobs
    .map((b) => b.key)
    .filter((k) => k.endsWith("/status"))
    .map((k) => k.slice(0, -"/status".length));

  const recoverable = [];
  for (const uploadId of uploadIds) {
    const status = (await store.get(statusKey(uploadId), {
      type: "json",
      consistency: "strong",
    })) as UploadStatus | null;
    if (!status) continue;

    const job = (await store.get(jobKey(uploadId), {
      type: "json",
      consistency: "strong",
    })) as UploadJob | null;
    if (!job) continue;

    // "done" jobs have their audio deleted, so they aren't re-runnable — but we
    // list them (with lessonId) so that after a recovery you can re-GET and grab
    // the link to the freshly-created draft.
    const present = status.state === "done" ? false : await audioPresent(store, uploadId, job.parts);
    let studentName = job.studentId;
    try {
      const student = await getStudentByIdForTutor(job.tutorId, job.studentId);
      if (student) studentName = student.name;
    } catch {
      // best-effort display only
    }

    recoverable.push({
      uploadId,
      state: status.state,
      error: status.state === "error" ? status.error : undefined,
      lessonId: status.state === "done" ? status.lessonId : undefined,
      tutorId: job.tutorId,
      studentId: job.studentId,
      studentName,
      durationMin: job.durationMin,
      audioPresent: present,
      recoverable: present,
    });
  }

  return json({ jobs: recoverable });
}

/** POST ?uploadId=... — reset the job to processing and re-fire the background worker. */
export async function POST(req: NextRequest): Promise<Response> {
  if (!(await currentAdminEmail())) return json({ error: "Not found." }, 404);

  const uploadId = req.nextUrl.searchParams.get("uploadId")?.trim();
  if (!uploadId) return json({ error: "Missing uploadId." }, 400);

  // Same rules as the tutor's own Retry button, minus the ownership check.
  const result = await restartProcessing(uploadId, null, req.nextUrl.origin);
  if (!result.ok) return json({ error: result.error }, result.status);

  return json({
    ok: true,
    uploadId,
    message:
      "Reprocessing started. Poll /api/upload/status?uploadId=" +
      uploadId +
      " — on success it returns the new lessonId.",
  });
}
