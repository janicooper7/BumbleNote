// Deletes lesson audio that outlived the job it belonged to.
//
// The happy path already deletes audio the instant the notes exist (see
// netlify/functions/process.mts). This module handles the two leftovers that path
// can't:
//
//   1. Failed jobs — the worker deliberately keeps the audio so /api/admin/recover
//      can re-run them. Nothing used to delete it afterwards, so it stayed forever.
//   2. Abandoned uploads — the client posted chunks and then never called
//      /complete (closed tab, lost connection). No job, no status, no worker, and
//      so nothing that would ever clean up.
//
// Both are swept AUDIO_RETENTION_MS after their last sign of life. That window is
// published in the privacy policy, which is the whole point of this file: the
// promise is only true because something enforces it.
//
// Next-free by design — the scheduled function (netlify/functions/purge-uploads)
// bundles this directly, and `next/*` isn't resolvable out there.

import {
  uploadStore,
  jobKey,
  statusKey,
  transcriptKey,
  AUDIO_RETENTION_MS,
  type ChunkMetadata,
  type UploadJob,
  type UploadStatus,
} from "./upload-store";

export type PurgeReport = {
  /** Upload directories examined. */
  scanned: number;
  /** Uploads whose retention window had closed, deleted in full. */
  expired: number;
  /** Audio/transcript blobs cleared from uploads that had already succeeded. */
  strays: number;
  /** Blobs deleted in total. */
  deleted: number;
};

/**
 * The slice of the Blobs API this sweep uses. Narrowed to an interface so tests
 * can drive the logic with an in-memory double — deletion rules are worth
 * verifying directly, since getting them wrong means either losing a tutor's
 * lesson or quietly breaking the retention promise.
 */
export type RetentionStore = Pick<
  ReturnType<typeof uploadStore>,
  "get" | "getMetadata" | "list" | "delete"
>;

type Store = RetentionStore;

/** Audio and transcript — the personal data. Everything else is bookkeeping. */
function isContentKey(uploadId: string, key: string): boolean {
  return key.startsWith(`${uploadId}/chunk/`) || key === transcriptKey(uploadId);
}

/**
 * When this upload's retention window closes, or null if it can't be aged.
 *
 * Deliberately biased towards deletion: an upload we can't date is one we can't
 * justify keeping, so a missing timestamp reads as "already expired" rather than
 * "keep indefinitely". The only case that must never be swept early is a job
 * still running — hence reading `startedAt` for anything mid-flight.
 */
async function expiresAt(
  store: Store,
  uploadId: string,
  keys: string[],
): Promise<number> {
  const status = (await store.get(statusKey(uploadId), { type: "json" })) as
    | UploadStatus
    | null;

  if (status?.state === "error") {
    return (status.failedAt ?? 0) + AUDIO_RETENTION_MS;
  }

  if (status?.state === "processing" || status?.state === "queued" || status?.state === "done") {
    // A live job must survive the sweep. `startedAt` is far more recent than the
    // retention window for anything actually running (the worker is capped at 15
    // minutes), so this only expires jobs that died without writing a status.
    const job = (await store.get(jobKey(uploadId), { type: "json" })) as UploadJob | null;
    return (job?.startedAt ?? 0) + AUDIO_RETENTION_MS;
  }

  // No status blob: the client uploaded chunks and never finalised. Date it from
  // the most recently written chunk.
  const chunkKeys = keys.filter((k) => k.startsWith(`${uploadId}/chunk/`));
  let newest = 0;
  for (const key of chunkKeys) {
    const meta = (await store.getMetadata(key))?.metadata as ChunkMetadata | undefined;
    if (typeof meta?.at === "number" && meta.at > newest) newest = meta.at;
  }
  return newest + AUDIO_RETENTION_MS;
}

async function deleteAll(store: Store, keys: string[]): Promise<number> {
  const results = await Promise.allSettled(keys.map((key) => store.delete(key)));
  return results.filter((r) => r.status === "fulfilled").length;
}

/**
 * Sweep the upload store. Safe to run repeatedly and concurrently — deleting an
 * already-deleted blob is a no-op, and a partial sweep is simply finished by the
 * next one. `now` and `store` are injectable so the rules can be tested without
 * waiting a week or touching real data.
 */
export async function purgeExpiredUploads({
  now = Date.now(),
  store = uploadStore(),
}: { now?: number; store?: RetentionStore } = {}): Promise<PurgeReport> {
  const report: PurgeReport = { scanned: 0, expired: 0, strays: 0, deleted: 0 };

  // Every key is `${uploadId}/...`, so the top-level directories are the uploads.
  // Paginated: an unpaginated list caps out, and a sweep that silently stopped
  // early would leave audio behind while still reporting success — which is
  // precisely the failure this whole file exists to prevent.
  const seen = new Set<string>();
  for await (const page of store.list({ directories: true, paginate: true })) {
    for (const dir of page.directories) seen.add(dir.replace(/\/$/, ""));
  }

  for (const uploadId of seen) {
    if (!uploadId) continue;
    report.scanned++;

    const { blobs } = await store.list({ prefix: `${uploadId}/` });
    const keys = blobs.map((b) => b.key);
    if (keys.length === 0) continue;

    if (now >= (await expiresAt(store, uploadId, keys))) {
      report.expired++;
      report.deleted += await deleteAll(store, keys);
      continue;
    }

    // Not expired, but a succeeded job should be holding no content at all. If the
    // worker's delete half-failed, finish the job now rather than waiting a week.
    const status = (await store.get(statusKey(uploadId), { type: "json" })) as
      | UploadStatus
      | null;
    if (status?.state === "done") {
      const stray = keys.filter((k) => isContentKey(uploadId, k));
      if (stray.length > 0) {
        report.strays += stray.length;
        report.deleted += await deleteAll(store, stray);
      }
    }
  }

  return report;
}
