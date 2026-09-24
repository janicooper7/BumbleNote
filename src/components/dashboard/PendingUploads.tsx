"use client";

// Dashboard-wide card for lessons still sitting in this browser's outbox
// (lib/pending-uploads) — recorded, but not yet on the server. Lives in the
// dashboard layout so it's there whatever page the tutor opens next.
//
// It resumes them on its own: once when the dashboard loads, and again whenever
// the browser comes back online. The tutor can also retry or discard by hand.
// Anything another tab (or the recorder dialog) is already sending is left to it.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  deletePending,
  listPending,
  lockedUploads,
  PENDING_CHANGED,
  withUploadLock,
  type PendingLesson,
} from "@/lib/pending-uploads";
import { sendPendingLesson } from "@/lib/upload-client";

type Row =
  | { phase: "waiting" }
  | { phase: "running" }
  | { phase: "done"; lessonId: string }
  | { phase: "error"; message: string };

export default function PendingUploads({
  students,
}: {
  students: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<PendingLesson[]>([]);
  const [busyElsewhere, setBusyElsewhere] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, Row>>({});
  const running = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const [pending, locked] = await Promise.all([listPending(), lockedUploads()]);
    setItems(pending);
    setBusyElsewhere(new Set([...locked].filter((id) => !running.current.has(id))));
    return { pending, locked };
  }, []);

  const send = useCallback(
    async (uploadId: string) => {
      if (running.current.has(uploadId)) return;
      running.current.add(uploadId);
      setRows((r) => ({ ...r, [uploadId]: { phase: "running" } }));
      try {
        const result = await withUploadLock(uploadId, () => sendPendingLesson(uploadId));
        // undefined: someone else holds it — they'll report the outcome.
        setRows((r) => ({
          ...r,
          [uploadId]: result ? { phase: "done", lessonId: result.lessonId } : { phase: "waiting" },
        }));
      } catch (err) {
        setRows((r) => ({
          ...r,
          [uploadId]: {
            phase: "error",
            message: err instanceof Error ? err.message : "That didn't work — try again shortly.",
          },
        }));
      } finally {
        running.current.delete(uploadId);
        void refresh();
      }
    },
    [refresh],
  );

  const resumeAll = useCallback(async () => {
    const { pending, locked } = await refresh();
    // One at a time: they share the tutor's upstream, and a slow connection is
    // the usual reason they're here at all.
    for (const l of pending) {
      if (l.retryable !== false && !locked.has(l.uploadId)) await send(l.uploadId);
    }
  }, [refresh, send]);

  useEffect(() => {
    void resumeAll();
    const onChange = () => void refresh();
    const onOnline = () => void resumeAll();
    window.addEventListener(PENDING_CHANGED, onChange);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener(PENDING_CHANGED, onChange);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, resumeAll]);

  async function discard(uploadId: string) {
    if (!window.confirm("Delete this recording? It hasn’t been uploaded and can’t be recovered.")) {
      return;
    }
    await deletePending(uploadId);
  }

  const names = new Map(students.map((s) => [s.id, s.name]));
  // Finished rows stay until the tutor opens them; the outbox entry is already gone.
  const done = Object.entries(rows).flatMap(([id, r]) => (r.phase === "done" ? [{ id, r }] : []));
  const visible = items.filter((l) => !busyElsewhere.has(l.uploadId));
  if (visible.length === 0 && done.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-5 shadow-soft-md"
    >
      <h2 className="font-display text-lg text-ink uppercase tracking-[.03em]">
        {visible.length > 0 ? "Lessons waiting to upload" : "Lesson uploaded"}
      </h2>
      {visible.length > 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          Saved in this browser. We keep trying until they reach BumbleNote, so you won’t
          need to re-record.
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {done.map(({ id, r }) => (
          <li key={id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm font-semibold text-ink">Draft ready</span>
            <Link
              href={`/dashboard/sessions/${(r as { lessonId: string }).lessonId}`}
              onClick={() => setRows((all) => ({ ...all, [id]: { phase: "waiting" } }))}
              className="rounded-full bg-cocoa px-3 py-1.5 text-xs font-semibold text-butter uppercase tracking-[.1em] hover:bg-cocoa-lift"
            >
              Open
            </Link>
          </li>
        ))}
        {visible.map((l) => {
          const row = rows[l.uploadId];
          const isRunning = row?.phase === "running";
          const message = row?.phase === "error" ? row.message : !isRunning ? l.lastError : undefined;
          const when = new Date(l.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <li key={l.uploadId} className="rounded-xl border border-line px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">
                    Lesson with {names.get(l.studentId) ?? "a student"}
                    <span className="font-normal text-muted"> · {l.durationMin} min</span>
                  </div>
                  <div className="text-xs text-muted">
                    {isRunning ? "Uploading…" : `Recorded ${when}`}
                  </div>
                </div>
                <div className="flex flex-none gap-1.5">
                  <button
                    onClick={() => void send(l.uploadId)}
                    disabled={isRunning}
                    className="rounded-full bg-cocoa px-3 py-1.5 text-xs font-semibold text-butter uppercase tracking-[.1em] hover:bg-cocoa-lift disabled:cursor-wait disabled:opacity-60"
                  >
                    {isRunning ? "Uploading" : "Retry"}
                  </button>
                  {!isRunning && (
                    <button
                      onClick={() => void discard(l.uploadId)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink"
                    >
                      Discard
                    </button>
                  )}
                </div>
              </div>
              {message && (
                <div role="alert" className="mt-1 text-xs text-[#c0524e]">
                  {message}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
