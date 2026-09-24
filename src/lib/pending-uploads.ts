// Browser-side outbox for recorded lessons that haven't reached the server yet.
//
// A lesson recording otherwise lives only in the tab's memory until /complete
// accepts it, so a slow connection (Netlify answers 408 when a chunk body arrives
// too slowly), a dropped Wi-Fi, or a closed tab loses a lesson that can't be
// taught again. Every recording is written here the moment it stops, and only
// removed once the server has all of its audio — from then on the server-side
// failed-lessons index owns any retry (see lib/failed-lessons).
//
// IndexedDB, because it's the only browser store that holds Blobs of this size.
// If it's unavailable (private windows, blocked storage, quota) the queue falls
// back to memory for this tab, which is exactly the old behaviour.

import type { TrimMaps } from "@/lib/upload-store";

export type PendingLesson = {
  uploadId: string;
  studentId: string;
  isTrial: boolean;
  durationMin: number;
  createdAt: number;
  /** The recording as captured, until it has been silence-trimmed. */
  raw?: { student: Blob; tutor: Blob };
  /**
   * The exact bytes being uploaded. Kept (instead of re-trimming the raw audio)
   * so a resumed upload re-slices identical chunks and can skip the ones the
   * server already holds.
   */
  trimmed?: { student: Blob; tutor: Blob; trimMaps: TrimMaps };
  /** Why the last attempt failed; absent while nothing has failed. */
  lastError?: string;
  /** false when the server refused it (quota, deleted student) — don't auto-retry. */
  retryable?: boolean;
};

const DB_NAME = "bumblenote";
const STORE = "pending-lessons";
export const PENDING_CHANGED = "bn:pending-uploads";

const memory = new Map<string, PendingLesson>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "uploadId" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error("IndexedDB unavailable"));
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PENDING_CHANGED));
}

/** Store (or replace) a lesson. Returns whether it survived to disk. */
export async function putPending(lesson: PendingLesson): Promise<boolean> {
  memory.set(lesson.uploadId, lesson);
  try {
    await run("readwrite", (s) => s.put(lesson));
    return true;
  } catch {
    return false; // memory copy still serves this tab
  } finally {
    changed();
  }
}

export async function getPending(uploadId: string): Promise<PendingLesson | undefined> {
  try {
    const found = await run("readonly", (s) => s.get(uploadId) as IDBRequest<PendingLesson | undefined>);
    if (found) return found;
  } catch {}
  return memory.get(uploadId);
}

export async function updatePending(
  uploadId: string,
  patch: Partial<PendingLesson>,
): Promise<void> {
  const current = await getPending(uploadId);
  if (current) await putPending({ ...current, ...patch });
}

export async function deletePending(uploadId: string): Promise<void> {
  memory.delete(uploadId);
  try {
    await run("readwrite", (s) => s.delete(uploadId));
  } catch {}
  changed();
}

export async function listPending(): Promise<PendingLesson[]> {
  const byId = new Map(memory);
  try {
    const stored = await run("readonly", (s) => s.getAll() as IDBRequest<PendingLesson[]>);
    for (const l of stored) byId.set(l.uploadId, l);
  } catch {}
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Run `fn` holding this upload's cross-tab lock, or return undefined if another
 * tab (or another part of this one) is already uploading it. Two tabs sending
 * the same lesson would race /complete and could bill it twice.
 */
export async function withUploadLock<T>(uploadId: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (typeof navigator === "undefined" || !navigator.locks) return fn();
  return navigator.locks.request(`bn-upload:${uploadId}`, { ifAvailable: true }, (lock) =>
    lock ? fn() : undefined,
  );
}

/** Upload ids some tab is sending right now. */
export async function lockedUploads(): Promise<Set<string>> {
  if (typeof navigator === "undefined" || !navigator.locks) return new Set();
  const { held = [] } = await navigator.locks.query();
  return new Set(
    held.flatMap((l) => (l.name?.startsWith("bn-upload:") ? [l.name.slice("bn-upload:".length)] : [])),
  );
}
