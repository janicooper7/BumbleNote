// Lessons whose processing failed, and re-running them. Server-only.
//
// A failed job keeps its audio (and any cached transcript) for
// AUDIO_RETENTION_MS, so re-firing the worker is a genuine retry — the tutor
// doesn't have to re-teach anything. Used by the tutor's own Retry button
// (/api/upload/retry, the dashboard list) and the operator tool
// (/api/admin/recover), so both follow exactly the same safety rules.

import { env } from "@/lib/env";
import { isQuotaError, releaseLesson, reserveLesson } from "@/lib/quota";
import {
  AUDIO_RETENTION_MS,
  chunkKey,
  clearLessonFailed,
  failedStore,
  jobKey,
  statusKey,
  transcriptKey,
  uploadStore,
  type FailedLesson,
  type UploadJob,
  type UploadStatus,
} from "@/lib/upload-store";

type Store = ReturnType<typeof uploadStore>;

async function readJob(store: Store, uploadId: string) {
  return (await store.get(jobKey(uploadId), { type: "json", consistency: "strong" })) as UploadJob | null;
}

async function readStatus(store: Store, uploadId: string) {
  return (await store.get(statusKey(uploadId), {
    type: "json",
    consistency: "strong",
  })) as UploadStatus | null;
}

/**
 * Whether the worker has what it needs to run again: a cached transcript, or the
 * first chunk of both tracks. The retention sweep deletes an upload's content all
 * at once, so the first chunks stand in for the rest without a metadata call per
 * chunk. The worker still fails cleanly if a later chunk were somehow missing.
 */
async function canRerun(store: Store, uploadId: string): Promise<boolean> {
  const [transcript, student, tutor] = await Promise.all([
    store.getMetadata(transcriptKey(uploadId)),
    store.getMetadata(chunkKey(uploadId, "student", 0)),
    store.getMetadata(chunkKey(uploadId, "tutor", 0)),
  ]);
  return !!transcript || (!!student && !!tutor);
}

export type RestartResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Re-fire the background worker for a failed upload.
 *
 * `tutorId` scopes the call to the job's owner; the operator route passes null.
 * Only an upload in the "error" state can be restarted — re-firing one that is
 * still processing, or already done, would draft the same lesson twice.
 */
export async function restartProcessing(
  uploadId: string,
  tutorId: string | null,
  origin: string,
): Promise<RestartResult> {
  const store = uploadStore();
  const [job, status] = await Promise.all([readJob(store, uploadId), readStatus(store, uploadId)]);

  if (!job || (tutorId !== null && job.tutorId !== tutorId)) {
    return { ok: false, status: 404, error: "We couldn't find that lesson." };
  }
  if (status?.state === "processing") {
    return { ok: false, status: 409, error: "This lesson is already being processed." };
  }
  if (status?.state === "done") {
    await clearLessonFailed(job.tutorId, uploadId);
    return { ok: false, status: 409, error: "This lesson has already been drafted." };
  }
  if (!(await canRerun(store, uploadId))) {
    await clearLessonFailed(job.tutorId, uploadId);
    return {
      ok: false,
      status: 410,
      error: "The recording for this lesson has been deleted, so it can't be retried.",
    };
  }

  // The failed attempt gave its credit back, so a retry needs one again — it pays
  // Deepgram (unless the transcript was cached) and Claude a second time. The
  // operator's recovery still holds one, but isn't refused at the limit: that's
  // for rescuing a lesson we failed, not the tutor spending more.
  try {
    await reserveLesson(job.tutorId, uploadId, { enforce: tutorId !== null });
  } catch (err) {
    if (isQuotaError(err)) return { ok: false, status: 402, error: err.message };
    throw err;
  }

  // Flip to processing first so a second click (or tab) is refused above. Restamp
  // startedAt too, or /api/upload/status would judge the retry against the
  // original attempt's clock and call it stalled on arrival.
  await Promise.all([
    store.setJSON(jobKey(uploadId), { ...job, startedAt: Date.now() } satisfies UploadJob),
    store.setJSON(statusKey(uploadId), { state: "processing" } satisfies UploadStatus),
  ]);

  try {
    const res = await fetch(`${origin}/.netlify/functions/process`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": env.INTERNAL_TASK_SECRET,
      },
      body: JSON.stringify({ uploadId }),
    });
    if (!res.ok && res.status !== 202) throw new Error(`Processing worker returned ${res.status}.`);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Couldn't start processing.";
    await store.setJSON(statusKey(uploadId), {
      state: "error",
      error,
      failedAt: Date.now(),
    } satisfies UploadStatus);
    await releaseLesson(uploadId);
    return { ok: false, status: 502, error: "We couldn't restart processing. Please try again shortly." };
  }

  return { ok: true };
}

export type FailedLessonView = FailedLesson & { error: string };

/**
 * The tutor's retryable failed lessons, newest first. Entries that no longer
 * describe a retryable lesson (succeeded since, audio swept, or past retention)
 * are dropped from the index as they're found.
 */
export async function listFailedLessons(tutorId: string): Promise<FailedLessonView[]> {
  const index = failedStore();
  const store = uploadStore();
  const { blobs } = await index.list({ prefix: `${tutorId}/` });

  const views = await Promise.all(
    blobs.map(async ({ key }): Promise<FailedLessonView | null> => {
      const entry = (await index.get(key, { type: "json" })) as FailedLesson | null;
      if (!entry) return null;

      const status = await readStatus(store, entry.uploadId);
      const expired = Date.now() - entry.failedAt > AUDIO_RETENTION_MS;
      if (status?.state !== "error" || expired || !(await canRerun(store, entry.uploadId))) {
        // Still processing (a retry in flight) isn't stale — just not shown.
        if (status?.state !== "processing") await clearLessonFailed(tutorId, entry.uploadId);
        return null;
      }
      return { ...entry, error: status.error };
    }),
  );

  return views
    .filter((v): v is FailedLessonView => v !== null)
    .sort((a, b) => b.failedAt - a.failedAt);
}
