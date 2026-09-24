// Client-side driver for the chunked lesson-audio upload (web app).
//
// Uploads a lesson from the browser outbox (lib/pending-uploads): slices each
// track into sub-6 MB parts (so every request clears Netlify's function-body
// limit), uploads them to /api/upload/chunk, finalizes via /api/upload/complete,
// then polls /api/upload/status until the background worker has produced the
// draft. Returns the new lesson id to navigate to.
//
// Each track is silence-trimmed first (see lib/audio-trim): it is a large cut in
// the Deepgram bill, and the smaller upload is a free bonus. The resulting trim
// maps travel with /complete so the worker can undo the compression.
//
// Uploads are resumable: the trimmed bytes are kept in the outbox and the upload
// id never changes, so a retry asks the server which parts it already holds and
// sends only the rest.
//
// The capture extension implements the same three-step flow in plain JS against
// the same endpoints (see extension/offscreen.js) — keep them in sync.

import { trimSilence } from "@/lib/audio-trim";
import { deletePending, getPending, putPending, updatePending } from "@/lib/pending-uploads";

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — comfortably under the 6 MB limit.
// Parallel chunk requests share the tutor's upstream bandwidth, so each one
// arrives slower. On a slow home connection 4 at once pushed single chunks past
// Netlify's body timeout (408); 2 still overlaps request latency.
const UPLOAD_CONCURRENCY = 2;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // background function's own ceiling.
const MAX_ATTEMPTS = 5; // per request, incl. the first try.
const RETRY_BASE_MS = 600; // exponential backoff base.

type Track = "student" | "tutor";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Statuses that mean "try again", not "you asked for something wrong". 408 is
 * Netlify's edge giving up on a request body that arrived too slowly — the
 * function never ran, so resending is both safe and usually enough.
 */
const isTransient = (status: number) => status >= 500 || status === 429 || status === 408;

/**
 * fetch with bounded exponential-backoff retries. A long lesson uploads as
 * dozens of chunks; without retries a single transient network blip on any one
 * of them ("fetch failed" / "Failed to fetch") kills the whole upload. We retry
 * network errors and transient statuses (see isTransient), but surface other 4xx
 * (a real client error) immediately. Honours an AbortSignal so cancel still works.
 */
async function fetchRetry(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new Error("Upload cancelled.");
    try {
      const res = await fetch(url, init);
      // Retry only on transient server statuses; return everything else (incl.
      // 4xx) to the caller, which decides how to report it.
      if (isTransient(res.status)) {
        if (attempt === MAX_ATTEMPTS) return res;
        lastErr = new Error(`Server returned ${res.status}.`);
      } else {
        return res;
      }
    } catch (err) {
      if (signal?.aborted) throw new Error("Upload cancelled.");
      lastErr = err; // network-level failure (TypeError: Failed to fetch / fetch failed)
      if (attempt === MAX_ATTEMPTS) break;
    }
    await sleep(RETRY_BASE_MS * 2 ** (attempt - 1)); // 600, 1200, 2400, 4800ms
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network request failed.");
}

/** Number of CHUNK_SIZE slices for a blob (at least 1, even if empty-ish). */
function partCount(blob: Blob): number {
  return Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));
}

/** Run tasks with bounded concurrency, preserving rejection. */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * A failed upload, with enough context to retry it the right way:
 *
 *   "reupload"  — the audio never finished reaching the server (network, 5xx).
 *                 The recording is still in the browser, so send it again.
 *   "reprocess" — the audio arrived and the server kept it, but turning it into a
 *                 draft failed. Re-run processing on the stored audio: re-uploading
 *                 would bill transcription twice and could draft the lesson twice.
 *   null        — retrying won't help (out of lessons, student deleted, …).
 */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly retry: "reupload" | "reprocess" | null,
    readonly uploadId?: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

async function pollUntilDone(
  uploadId: string,
  authHeader: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ lessonId: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal?.aborted) throw new UploadError("Upload cancelled.", null);

    // A transient network error mid-poll must not kill a job that's still
    // processing (or already done) — swallow it and poll again next tick.
    let res: Response;
    try {
      res = await fetch(`/api/upload/status?uploadId=${uploadId}`, {
        headers: authHeader,
        signal,
      });
    } catch {
      if (signal?.aborted) throw new UploadError("Upload cancelled.", null);
      continue;
    }
    if (!res.ok) continue; // transient (e.g. eventual-consistency 404); keep polling.
    const status = await res.json();
    if (status.state === "done") return { lessonId: status.lessonId };
    if (status.state === "error") {
      throw new UploadError(status.error || "Processing failed.", "reprocess", uploadId);
    }
  }
  // The job may still finish; the server keeps the audio either way.
  throw new UploadError("Processing is taking longer than expected.", "reprocess", uploadId);
}

/** Re-run processing for an upload whose audio the server already has. */
export async function retryLessonProcessing(uploadId: string): Promise<{ lessonId: string }> {
  const res = await fetchRetry(`/api/upload/retry?uploadId=${encodeURIComponent(uploadId)}`, {
    method: "POST",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 409 "already processing" is worth following; anything else is final.
    if (res.status === 409 && /already being processed/.test(data.error ?? "")) {
      return pollUntilDone(uploadId, {});
    }
    throw new UploadError(data.error || `Couldn't retry (${res.status}).`, null, uploadId);
  }
  return pollUntilDone(uploadId, {});
}

/** Queue a finished recording in the outbox before any network is touched. */
export async function queueLessonRecording(opts: {
  studentId: string;
  durationMin: number;
  isTrial?: boolean;
  student: Blob;
  tutor: Blob;
}): Promise<string> {
  const uploadId = crypto.randomUUID();
  await putPending({
    uploadId,
    studentId: opts.studentId,
    durationMin: opts.durationMin,
    isTrial: !!opts.isTrial,
    createdAt: Date.now(),
    raw: { student: opts.student, tutor: opts.tutor },
  });
  return uploadId;
}

/** Parts of this upload the server already holds, per track. Best effort. */
async function uploadedParts(uploadId: string): Promise<Record<Track, Set<number>>> {
  const none = { student: new Set<number>(), tutor: new Set<number>() };
  try {
    const res = await fetch(`/api/upload/chunk?uploadId=${uploadId}`);
    if (!res.ok) return none;
    const data: { parts?: Partial<Record<Track, number[]>> } = await res.json();
    return {
      student: new Set(data.parts?.student ?? []),
      tutor: new Set(data.parts?.tutor ?? []),
    };
  } catch {
    return none; // worst case we resend parts; the server just overwrites them.
  }
}

/**
 * Send a queued lesson to the server and wait for its draft. Safe to call again
 * after any failure: it resumes where the last attempt stopped. The outbox entry
 * is removed as soon as /complete accepts the upload — from there the audio is
 * the server's, and a processing failure is retried from the server copy.
 */
export async function sendPendingLesson(
  uploadId: string,
  signal?: AbortSignal,
): Promise<{ lessonId: string }> {
  const lesson = await getPending(uploadId);
  if (!lesson) throw new UploadError("This recording is no longer saved on this device.", null);

  try {
    // Trim before slicing: every byte of silence we drop here is a byte we do not
    // upload and a second Deepgram does not bill. One track at a time — decoding a
    // long lesson holds a few hundred MB, and doing both at once has no upside
    // (it is CPU-bound, not IO-bound) beyond doubling the peak.
    let trimmed = lesson.trimmed;
    if (!trimmed) {
      if (!lesson.raw) throw new UploadError("This recording came through empty.", null);
      const studentTrim = await trimSilence(lesson.raw.student);
      const tutorTrim = await trimSilence(lesson.raw.tutor);
      trimmed = {
        student: studentTrim.blob,
        tutor: tutorTrim.blob,
        trimMaps: { student: studentTrim.map, tutor: tutorTrim.map },
      };
      // Swap raw for trimmed so the outbox holds one copy, and a resume re-sends
      // byte-identical chunks.
      await putPending({ ...lesson, raw: undefined, trimmed });
    }

    const tracks: Record<Track, Blob> = { student: trimmed.student, tutor: trimmed.tutor };
    const parts = { student: partCount(tracks.student), tutor: partCount(tracks.tutor) };
    const have = await uploadedParts(uploadId);

    // Build the flat list of chunk uploads across both tracks, then run the pool.
    const jobs: { track: Track; part: number; blob: Blob }[] = [];
    for (const track of ["student", "tutor"] as const) {
      const blob = tracks[track];
      for (let i = 0; i < parts[track]; i++) {
        if (have[track].has(i)) continue;
        jobs.push({ track, part: i, blob: blob.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
      }
    }

    // Everything up to a successful /complete can be resumed from the outbox. A
    // non-transient 4xx is a real refusal (quota, unknown student) that resending
    // won't change.
    const refusal = (status: number) => (isTransient(status) ? "reupload" : null);

    // Stop the other workers on the first failure instead of letting them keep
    // uploading for minutes behind an error the tutor is already looking at.
    const stop = new AbortController();
    const abortAll = () => stop.abort();
    signal?.addEventListener("abort", abortAll);
    try {
      await runPool(jobs, UPLOAD_CONCURRENCY, async ({ track, part, blob }) => {
        if (stop.signal.aborted) return;
        const url = `/api/upload/chunk?uploadId=${uploadId}&track=${track}&part=${part}`;
        try {
          const res = await fetchRetry(url, { method: "POST", body: blob, signal: stop.signal }, stop.signal);
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new UploadError(
              data.error || `Upload failed (${res.status}).`,
              refusal(res.status),
              uploadId,
            );
          }
        } catch (err) {
          stop.abort();
          throw err;
        }
      });
    } finally {
      signal?.removeEventListener("abort", abortAll);
    }

    const completeRes = await fetchRetry(
      "/api/upload/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadId,
          studentId: lesson.studentId,
          durationMin: lesson.durationMin,
          isTrial: lesson.isTrial,
          parts,
          trimMaps: trimmed.trimMaps,
        }),
        signal,
      },
      signal,
    );
    const completeData = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok) {
      throw new UploadError(
        completeData.error || `Couldn't start processing (${completeRes.status}).`,
        refusal(completeRes.status),
        uploadId,
      );
    }
  } catch (err) {
    const failure =
      err instanceof UploadError
        ? err
        : signal?.aborted
          ? new UploadError("Upload cancelled.", "reupload", uploadId)
          : // Network failure that outlasted fetchRetry's backoff.
            new UploadError(
              "We couldn't upload the recording — check your connection.",
              "reupload",
              uploadId,
            );
    await updatePending(uploadId, {
      lastError: failure.message,
      retryable: failure.retry !== null,
    });
    throw failure;
  }

  await deletePending(uploadId);
  return pollUntilDone(uploadId, {}, signal);
}
