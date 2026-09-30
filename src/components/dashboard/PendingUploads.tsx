"use client";

// Dashboard-wide lesson tracker, in the corner of every dashboard page. Follows
// each lesson from Stop to notes:
//
//   1. In this browser's outbox (lib/pending-uploads): recorded, not yet on the
//      server. Uploaded from here — straight after recording, again when the
//      dashboard loads, and whenever the browser comes back online. The tutor can
//      also retry or discard by hand. Anything another tab is already sending is
//      left to it.
//   2. On the server: waiting in the transcription queue (with its place in
//      line) or being processed. Seeded from /api/upload/active, so lessons from
//      another tab or from before a reload show too, then polled one by one.
//   3. Ready: an Open button. The tracker never navigates on its own, so a
//      finished lesson can't pull the tutor out of the one they're recording.
//
// A lesson whose processing fails goes to the overview's FailedLessons card,
// which owns the retry.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deletePending,
  listPending,
  lockedUploads,
  PENDING_CHANGED,
  withUploadLock,
  type PendingLesson,
} from "@/lib/pending-uploads";
import {
  activeLessons,
  LESSON_RECORDED,
  LESSON_TRACK,
  lessonProgress,
  sendPendingLesson,
  type TrackedLesson,
} from "@/lib/upload-client";

const POLL_MS = 4000;

type Send = { phase: "running" } | { phase: "error"; message: string };

type Tracked = TrackedLesson & {
  since: number;
  progress:
    | { state: "processing" }
    | { state: "queued"; position: number }
    | { state: "done"; lessonId: string }
    | { state: "error"; error: string };
};

const isActive = (t: Tracked) => t.progress.state === "processing" || t.progress.state === "queued";

function without<T>(all: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...all };
  delete rest[key];
  return rest;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export default function PendingUploads({
  students,
}: {
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<PendingLesson[]>([]);
  const [busyElsewhere, setBusyElsewhere] = useState<Set<string>>(new Set());
  const [sends, setSends] = useState<Record<string, Send>>({});
  const [tracked, setTracked] = useState<Record<string, Tracked>>({});
  const running = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const [pending, locked] = await Promise.all([listPending(), lockedUploads()]);
    setItems(pending);
    setBusyElsewhere(new Set([...locked].filter((id) => !running.current.has(id))));
    return { pending, locked };
  }, []);

  const track = useCallback((lesson: TrackedLesson, progress: Tracked["progress"] = { state: "processing" }) => {
    setTracked((all) => {
      const known = all[lesson.uploadId];
      // Keep a live lesson's place in line over a guess; a finished one that's
      // back (a retry) starts over.
      if (known && isActive(known)) return all;
      return { ...all, [lesson.uploadId]: { ...lesson, since: Date.now(), progress } };
    });
  }, []);

  const send = useCallback(
    async (uploadId: string) => {
      if (running.current.has(uploadId)) return;
      running.current.add(uploadId);
      setSends((s) => ({ ...s, [uploadId]: { phase: "running" } }));
      try {
        const lesson = await withUploadLock(uploadId, () => sendPendingLesson(uploadId));
        // undefined: another tab holds it, and that tab's tracker follows it.
        if (lesson) track(lesson);
        setSends((s) => without(s, uploadId));
      } catch (err) {
        setSends((s) => ({
          ...s,
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
    [refresh, track],
  );

  const resumeAll = useCallback(async () => {
    const { pending, locked } = await refresh();
    // One at a time: they share the tutor's upstream, and a slow connection is
    // the usual reason they're here at all.
    for (const l of pending) {
      if (l.retryable !== false && !locked.has(l.uploadId)) await send(l.uploadId);
    }
  }, [refresh, send]);

  const loadActive = useCallback(async () => {
    for (const l of await activeLessons()) {
      track(
        l,
        l.state === "waiting" && l.position ? { state: "queued", position: l.position } : { state: "processing" },
      );
    }
  }, [track]);

  useEffect(() => {
    void resumeAll();
    void loadActive();
    const onChange = () => void refresh();
    const onOnline = () => void resumeAll();
    const onFocus = () => void loadActive();
    const onRecorded = (e: Event) => void send((e as CustomEvent<string>).detail);
    const onTrack = (e: Event) => track((e as CustomEvent<TrackedLesson>).detail);
    window.addEventListener(PENDING_CHANGED, onChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener(LESSON_RECORDED, onRecorded);
    window.addEventListener(LESSON_TRACK, onTrack);
    return () => {
      window.removeEventListener(PENDING_CHANGED, onChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(LESSON_RECORDED, onRecorded);
      window.removeEventListener(LESSON_TRACK, onTrack);
    };
  }, [refresh, resumeAll, loadActive, send, track]);

  // Follow every lesson the server is working on until it's done or failed.
  const activeIds = Object.values(tracked)
    .filter(isActive)
    .map((t) => t.uploadId)
    .join();
  useEffect(() => {
    if (!activeIds) return;
    let stopped = false;
    const tick = async () => {
      const results = await Promise.all(
        activeIds.split(",").map(async (id) => [id, await lessonProgress(id)] as const),
      );
      if (stopped) return;
      setTracked((all) => {
        const next = { ...all };
        for (const [id, progress] of results) {
          // Unreadable just now: ask again next tick.
          if (progress && next[id]) next[id] = { ...next[id], progress };
        }
        return next;
      });
      // The new draft (or the failed lesson's Retry card) belongs on the page now.
      if (results.some(([, p]) => p?.state === "done" || p?.state === "error")) router.refresh();
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeIds, router]);

  // Closing the tab mid-upload doesn't lose the lesson (it's in the outbox), but
  // its notes then wait until the tutor is back. Worth a prompt.
  const uploading = Object.values(sends).some((s) => s.phase === "running");
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  async function discard(uploadId: string) {
    if (!window.confirm("Delete this recording? It hasn’t been uploaded and can’t be recovered.")) {
      return;
    }
    await deletePending(uploadId);
  }

  const forget = (uploadId: string) => setTracked((all) => without(all, uploadId));

  const names = new Map(students.map((s) => [s.id, s.name]));
  const outbox = items.filter((l) => !busyElsewhere.has(l.uploadId));
  const inOutbox = new Set(items.map((l) => l.uploadId));
  const lessons = Object.values(tracked)
    .filter((t) => !inOutbox.has(t.uploadId))
    .sort((a, b) => a.since - b.since);
  if (!outbox.length && !lessons.length) return null;

  const title = outbox.length
    ? "Lessons waiting to upload"
    : lessons.some(isActive)
      ? lessons.length === 1
        ? "Lesson in progress"
        : "Lessons in progress"
      : lessons.every((t) => t.progress.state === "done")
        ? "Notes ready"
        : "Your lessons";

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-5 shadow-soft-md"
    >
      <h2 className="font-display text-lg text-ink uppercase tracking-[.03em]">{title}</h2>
      {outbox.length > 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          Saved in this browser. We keep trying until they reach BumbleNote, so you won’t
          need to re-record.
        </p>
      )}

      <ul className="mt-3 flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {outbox.map((l) => {
          const s = sends[l.uploadId];
          const isRunning = s?.phase === "running";
          const message = s?.phase === "error" ? s.message : !isRunning ? l.lastError : undefined;
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
                  <LessonName name={names.get(l.studentId)} minutes={l.durationMin} />
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

        {lessons.map((t) => {
          const p = t.progress;
          return (
            <li key={t.uploadId} className="rounded-xl border border-line px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <LessonName name={names.get(t.studentId)} minutes={t.durationMin} />
                  {p.state === "processing" && (
                    <div className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <Spinner /> Writing the notes… usually a minute or two.
                    </div>
                  )}
                  {p.state === "queued" && (
                    <div className="text-xs text-ink-soft">
                      <span className="font-semibold text-ink">In the queue · {ordinal(p.position)} in line.</span>{" "}
                      We&apos;re busy right now — it starts automatically in a minute or two.
                    </div>
                  )}
                  {p.state === "done" && <div className="text-xs text-ink-soft">Notes ready to review.</div>}
                  {p.state === "error" && (
                    <>
                      <div className="text-xs text-[#c0524e]">The notes didn’t finish: {p.error}</div>
                      <Link
                        href="/dashboard"
                        onClick={() => forget(t.uploadId)}
                        className="mt-1 inline-block text-xs font-semibold text-ink underline"
                      >
                        Retry from your overview
                      </Link>
                    </>
                  )}
                </div>
                {p.state === "done" && (
                  <div className="flex flex-none items-center gap-1.5">
                    <Link
                      href={`/dashboard/sessions/${p.lessonId}`}
                      onClick={() => forget(t.uploadId)}
                      className="rounded-full bg-cocoa px-3 py-1.5 text-xs font-semibold text-butter uppercase tracking-[.1em] hover:bg-cocoa-lift"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => forget(t.uploadId)}
                      aria-label="Hide"
                      className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-brand-soft/50 hover:text-ink"
                    >
                      ×
                    </button>
                  </div>
                )}
                {p.state === "error" && (
                  <button
                    onClick={() => forget(t.uploadId)}
                    aria-label="Hide"
                    className="grid h-7 w-7 flex-none place-items-center rounded-full text-ink-soft hover:bg-brand-soft/50 hover:text-ink"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function LessonName({ name, minutes }: { name?: string; minutes: number }) {
  return (
    <div className="text-sm font-semibold text-ink">
      Lesson with {name ?? "a student"}
      <span className="font-normal text-muted"> · {minutes} min</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 flex-none animate-spin text-brand-deep" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}
