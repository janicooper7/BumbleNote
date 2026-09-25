"use client";

// Dashboard banner listing lessons that were recorded and uploaded but failed to
// turn into a draft. The recording is still stored (for a limited time), so Retry
// re-runs processing on it — nothing has to be taught again. Dismiss drops a
// lesson the tutor doesn't want back (a false start) and deletes its audio.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dismissFailedLesson, retryLessonProcessing } from "@/lib/upload-client";

export type FailedLessonItem = {
  uploadId: string;
  studentName: string;
  durationMin: number;
  failedAt: number;
  /** Why processing failed, as the worker reported it. */
  error: string;
  /** False when re-running would fail the same way (e.g. no speech in it). */
  canRetry: boolean;
  /** Days left before the stored recording is deleted. */
  daysLeft: number;
};

type RowState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "dismissing" }
  | { phase: "error"; message: string };

export default function FailedLessons({ items }: { items: FailedLessonItem[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fail = (uploadId: string, err: unknown) =>
    setRows((r) => ({
      ...r,
      [uploadId]: {
        phase: "error",
        message: err instanceof Error ? err.message : "That didn't work — try again shortly.",
      },
    }));

  async function retry(uploadId: string) {
    setRows((r) => ({ ...r, [uploadId]: { phase: "running" } }));
    try {
      const { lessonId } = await retryLessonProcessing(uploadId);
      router.push(`/dashboard/sessions/${lessonId}`);
    } catch (err) {
      fail(uploadId, err);
    }
  }

  async function dismiss(uploadId: string) {
    setRows((r) => ({ ...r, [uploadId]: { phase: "dismissing" } }));
    try {
      await dismissFailedLesson(uploadId);
      setDismissed((d) => new Set(d).add(uploadId));
      router.refresh();
    } catch (err) {
      fail(uploadId, err);
    }
  }

  const visible = items.filter((i) => !dismissed.has(i.uploadId));
  if (visible.length === 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-[#f1c4c2] bg-[#fdf6f5] p-6 shadow-soft-sm">
      <h2 className="font-display text-xl text-ink uppercase tracking-[.03em]">
        {visible.length === 1 ? "A lesson didn’t finish" : `${visible.length} lessons didn’t finish`}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        The recording was saved, but we couldn’t turn it into a draft. Retry to process it
        again — you won’t need to re-record — or dismiss it if you don’t need it.
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {visible.map((item) => {
          const row = rows[item.uploadId] ?? { phase: "idle" };
          const busy = row.phase === "running" || row.phase === "dismissing";
          const when = new Date(item.failedAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <li
              key={item.uploadId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-ink">
                  Lesson with {item.studentName}
                  <span className="font-normal text-muted"> · {item.durationMin} min</span>
                </div>
                <div className="text-xs text-muted">
                  Failed {when} · recording kept for {item.daysLeft} more{" "}
                  {item.daysLeft === 1 ? "day" : "days"}
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  {item.canRetry
                    ? item.error
                    : "There wasn’t enough speech in this recording to make notes from, so retrying won’t help."}
                </div>
                {row.phase === "error" && (
                  <div role="alert" className="mt-1 text-xs text-[#c0524e]">
                    {row.message}
                  </div>
                )}
              </div>
              <div className="flex flex-none items-center gap-2">
                <button
                  onClick={() => void dismiss(item.uploadId)}
                  disabled={busy}
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-soft uppercase tracking-[.1em] transition-colors duration-300 hover:border-ink-soft hover:text-ink disabled:cursor-wait disabled:opacity-70"
                >
                  {row.phase === "dismissing" ? "Dismissing…" : "Dismiss"}
                </button>
                {item.canRetry && (
                  <button
                    onClick={() => void retry(item.uploadId)}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 uppercase tracking-[.1em] hover:bg-cocoa-lift"
                  >
                    {row.phase === "running" ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                        </svg>
                        Processing…
                      </>
                    ) : (
                      "Retry"
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
