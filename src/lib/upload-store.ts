// Shared contract for the chunked lesson-audio upload, used by the /api/upload/*
// routes AND the netlify/functions/process background worker. Keeping the store
// name, key layout, and payload shapes in one place stops the writer and reader
// from drifting apart.
//
// Flow: the client slices each track into ~4 MB parts and POSTs them to
// /api/upload/chunk (each part -> one blob). /api/upload/complete records a `job`
// + `status` blob and kicks the background function, which concatenates the parts,
// transcribes + drafts, writes the final `status`, and deletes the audio.

import { getStore } from "@netlify/blobs";
import type { TrimMap } from "./audio-trim";

export const UPLOAD_STORE = "lesson-uploads";

export type Track = "student" | "tutor";

/** Per-track part counts for one upload. */
export type Parts = { student: number; tutor: number };

/**
 * Per-track silence-trim maps (see lib/audio-trim). The browser trims each track
 * before upload so Deepgram bills speech rather than wall-clock, which leaves the
 * word timestamps in a compressed timeline; the worker needs these to put them
 * back on real lesson time before interleaving the two speakers. A missing entry
 * means that track was uploaded untrimmed.
 *
 * Type-only import, so the Netlify worker never pulls the browser module in.
 */
export type TrimMaps = { student?: TrimMap; tutor?: TrimMap };

/** Authoritative job description written by /api/upload/complete (post-auth). */
export type UploadJob = {
  tutorId: string;
  studentId: string;
  durationMin: number;
  parts: Parts;
  trimMaps?: TrimMaps;
  /**
   * Epoch ms the worker was (re)triggered. The worker can be killed outright —
   * platform timeout, OOM, a deploy mid-run — and a killed process runs no catch
   * block, so it never writes a terminal status. Without this, such a job sits on
   * "processing" forever and the client polls until its own deadline. Optional so
   * jobs written before this field existed still parse.
   */
  startedAt?: number;
};

/**
 * How long a job may stay "processing" before /api/upload/status calls it dead.
 * Above the worker's realistic worst case (~10 min: transcribe, then Claude at
 * 2 x 300s) and below both the platform's 15-min kill and the client's 15-min
 * poll deadline — so the client still has time to see the error we report.
 */
export const STALL_AFTER_MS = 13 * 60 * 1000;

/** Poll state read by /api/upload/status. */
export type UploadStatus =
  | { state: "processing" }
  | { state: "done"; lessonId: string }
  | {
      state: "error";
      error: string;
      /**
       * Epoch ms the job failed. Starts the retention clock on the audio a failed
       * job leaves behind — see AUDIO_RETENTION_MS. Optional so statuses written
       * before this field existed still parse; the sweep treats a missing value
       * as already expired, which is the privacy-safe reading.
       */
      failedAt?: number;
    };

/**
 * How long lesson audio may outlive the job that was meant to consume it.
 *
 * The happy path deletes audio the moment the notes exist (see the worker), so
 * this only governs the leftovers: jobs that failed, and uploads the client
 * abandoned before calling /complete. Both are kept briefly so a lesson can be
 * re-run rather than lost — /api/admin/recover depends on it — and then deleted
 * automatically by netlify/functions/purge-uploads.
 *
 * This window is a published promise in the privacy policy (src/app/privacy).
 * Changing it here means changing it there.
 */
export const AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Metadata stamped on every chunk so the sweep can age out abandoned uploads. */
export type ChunkMetadata = { at?: number };

export function uploadStore() {
  return getStore(UPLOAD_STORE);
}

export function chunkKey(uploadId: string, track: Track, part: number): string {
  return `${uploadId}/chunk/${track}/${part}`;
}

export function jobKey(uploadId: string): string {
  return `${uploadId}/job`;
}

export function statusKey(uploadId: string): string {
  return `${uploadId}/status`;
}

/**
 * The labelled transcript, cached after speech-to-text succeeds. Transcription is
 * the expensive, deterministic half of the pipeline; the drafting step after it is
 * the one that fails. Caching lets a retry skip Deepgram entirely instead of
 * re-billing both tracks. Deleted alongside the audio on success, and swept with
 * it on failure — see the "audio is transient" rule in PLAN.md §9.
 *
 * Counts as lesson content for retention purposes: it is a verbatim record of what
 * was said, so it lives and dies with the audio, never longer.
 */
export function transcriptKey(uploadId: string): string {
  return `${uploadId}/transcript`;
}

/**
 * Per-tutor index of lessons whose processing failed, so the dashboard can offer
 * a Retry without scanning every upload in the store. A separate store on
 * purpose: the retention sweep treats every top-level directory of
 * UPLOAD_STORE as an upload, and an index living there would be swept as one.
 *
 * The index is a hint, not the truth. Entries are written when a job fails and
 * removed when it succeeds, but the upload's own status and audio are always
 * re-checked before anything is shown or retried (see lib/failed-lessons).
 */
export const FAILED_STORE = "failed-lessons";

export type FailedLesson = {
  uploadId: string;
  studentId: string;
  durationMin: number;
  failedAt: number;
};

export function failedStore() {
  return getStore(FAILED_STORE);
}

export function failedKey(tutorId: string, uploadId: string): string {
  return `${tutorId}/${uploadId}`;
}

/** Record a failure for the tutor's Retry list. Never throws — it's bookkeeping. */
export async function markLessonFailed(
  uploadId: string,
  job: Pick<UploadJob, "tutorId" | "studentId" | "durationMin">,
): Promise<void> {
  try {
    await failedStore().setJSON(failedKey(job.tutorId, uploadId), {
      uploadId,
      studentId: job.studentId,
      durationMin: job.durationMin,
      failedAt: Date.now(),
    } satisfies FailedLesson);
  } catch (err) {
    console.error(`could not index failed upload ${uploadId}:`, err);
  }
}

/** Drop a lesson from the Retry list. Never throws. */
export async function clearLessonFailed(tutorId: string, uploadId: string): Promise<void> {
  try {
    await failedStore().delete(failedKey(tutorId, uploadId));
  } catch (err) {
    console.error(`could not clear failed index for ${uploadId}:`, err);
  }
}

/** All chunk keys for a completed upload, in read order. */
export function allChunkKeys(uploadId: string, parts: Parts): string[] {
  const keys: string[] = [];
  for (const track of ["student", "tutor"] as const) {
    for (let i = 0; i < parts[track]; i++) keys.push(chunkKey(uploadId, track, i));
  }
  return keys;
}
