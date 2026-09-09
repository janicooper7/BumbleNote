// Client-side driver for the chunked lesson-audio upload (web app).
//
// Slices each track into sub-6 MB parts (so every request clears Netlify's
// function-body limit), uploads them to /api/upload/chunk, finalizes via
// /api/upload/complete, then polls /api/upload/status until the background worker
// has produced the draft. Returns the new lesson id to navigate to.
//
// Each track is silence-trimmed first (see lib/audio-trim): it is a large cut in
// the Deepgram bill, and the smaller upload is a free bonus. The resulting trim
// maps travel with /complete so the worker can undo the compression.
//
// The capture extension implements the same three-step flow in plain JS against
// the same endpoints (see extension/offscreen.js) — keep them in sync.

import { trimSilence, type TrimMap } from "@/lib/audio-trim";

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — comfortably under the 6 MB limit.
const UPLOAD_CONCURRENCY = 4;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // background function's own ceiling.
const MAX_ATTEMPTS = 5; // per request, incl. the first try.
const RETRY_BASE_MS = 600; // exponential backoff base.

type Track = "student" | "tutor";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with bounded exponential-backoff retries. A long lesson uploads as
 * dozens of chunks; without retries a single transient network blip on any one
 * of them ("fetch failed" / "Failed to fetch") kills the whole upload. We retry
 * network errors and 5xx/429 responses, but surface 4xx (a real client error)
 * immediately. Honours an AbortSignal so cancel still works.
 */
async function fetchRetry(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new Error("Upload cancelled.");
    try {
      const res = await fetch(url, init);
      // Retry only on transient server statuses; return everything else (incl.
      // 4xx) to the caller, which decides how to report it.
      if (res.status >= 500 || res.status === 429) {
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

export type UploadLessonAudioOptions = {
  studentId: string;
  durationMin: number;
  student: Blob;
  tutor: Blob;
  /** Bearer token for the extension; the web app relies on session cookies. */
  authToken?: string;
  signal?: AbortSignal;
};

export async function uploadLessonAudio(
  opts: UploadLessonAudioOptions,
): Promise<{ lessonId: string }> {
  const { studentId, durationMin, authToken, signal } = opts;
  const uploadId = crypto.randomUUID();

  // Trim before slicing: every byte of silence we drop here is a byte we do not
  // upload and a second Deepgram does not bill. One track at a time — decoding a
  // long lesson holds a few hundred MB, and doing both at once has no upside
  // (it is CPU-bound, not IO-bound) beyond doubling the peak.
  const studentTrim = await trimSilence(opts.student);
  const tutorTrim = await trimSilence(opts.tutor);
  const student = studentTrim.blob;
  const tutor = tutorTrim.blob;
  const trimMaps: { student?: TrimMap; tutor?: TrimMap } = {
    student: studentTrim.map,
    tutor: tutorTrim.map,
  };
  const authHeader: Record<string, string> = authToken
    ? { authorization: `Bearer ${authToken}` }
    : {};

  const tracks: Record<Track, Blob> = { student, tutor };
  const parts = { student: partCount(student), tutor: partCount(tutor) };

  // Build the flat list of chunk uploads across both tracks, then run the pool.
  const jobs: { track: Track; part: number; blob: Blob }[] = [];
  for (const track of ["student", "tutor"] as const) {
    const blob = tracks[track];
    for (let i = 0; i < parts[track]; i++) {
      jobs.push({ track, part: i, blob: blob.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
    }
  }

  await runPool(jobs, UPLOAD_CONCURRENCY, async ({ track, part, blob }) => {
    const url = `/api/upload/chunk?uploadId=${uploadId}&track=${track}&part=${part}`;
    const res = await fetchRetry(
      url,
      { method: "POST", headers: authHeader, body: blob, signal },
      signal,
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Upload failed (${res.status}).`);
    }
  });

  const completeRes = await fetchRetry(
    "/api/upload/complete",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader },
      body: JSON.stringify({ uploadId, studentId, durationMin, parts, trimMaps }),
      signal,
    },
    signal,
  );
  const completeData = await completeRes.json().catch(() => ({}));
  if (!completeRes.ok) {
    throw new Error(completeData.error || `Couldn't start processing (${completeRes.status}).`);
  }

  // Poll until the worker reports done or error.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal?.aborted) throw new Error("Upload cancelled.");

    // A transient network error mid-poll must not kill a job that's still
    // processing (or already done) — swallow it and poll again next tick.
    let res: Response;
    try {
      res = await fetch(`/api/upload/status?uploadId=${uploadId}`, {
        headers: authHeader,
        signal,
      });
    } catch {
      if (signal?.aborted) throw new Error("Upload cancelled.");
      continue;
    }
    if (!res.ok) continue; // transient (e.g. eventual-consistency 404); keep polling.
    const status = await res.json();
    if (status.state === "done") return { lessonId: status.lessonId };
    if (status.state === "error") throw new Error(status.error || "Processing failed.");
  }
  throw new Error("Processing timed out — please try again.");
}
