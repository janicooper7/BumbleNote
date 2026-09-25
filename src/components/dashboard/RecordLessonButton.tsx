"use client";

// Global "Record a lesson" button for the sidebar. Because it isn't tied to a
// student, it first prompts which student the lesson is for, then drives the
// shared recorder hook. Recording/processing shows a modal overlay so the tutor
// keeps control from anywhere in the dashboard.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Avatar from "./Avatar";
import { SearchIcon } from "./icons";
import { useSessionRecorder, formatElapsed, silenceWarning } from "./useSessionRecorder";

type PickStudent = { id: string; name: string; initial: string };

/** The tutor's lesson allowance, resolved on the server (src/lib/quota.ts). */
export type LessonQuotaView = {
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  planName: string;
  /** Free trial: a lifetime allowance that never resets. */
  trial: boolean;
  /** Subscription paused: no allowance this period, carried-over lessons only. */
  paused: boolean;
  /** A subscriber, whose lessons renew on their billing date. */
  rollover: boolean;
  /** When the next allowance arrives, e.g. "20 October"; null for the trial. */
  renewsOn: string | null;
};

export default function RecordLessonButton({
  students,
  quota,
}: {
  students: PickStudent[];
  quota: LessonQuotaView;
}) {
  const { status, elapsed, error, canRetry, silent, start, stop, retry, reset } = useSessionRecorder();
  const warning = silenceWarning(silent);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosen, setChosen] = useState<PickStudent | null>(null);
  const [query, setQuery] = useState("");
  const [trial, setTrial] = useState(false);

  const open = pickerOpen || status !== "idle";
  const firstName = chosen?.name.split(" ")[0] ?? "the student";

  const showSearch = students.length > 3;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, query]);

  function pick(s: PickStudent) {
    setChosen(s);
    setPickerOpen(false); // hand off to the recording overlay (driven by status)
    setQuery("");
    void start(s.id, trial);
  }

  function closeIdle() {
    setPickerOpen(false);
    setChosen(null);
    setQuery("");
    setTrial(false);
    reset();
  }

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-cocoa px-4 py-3 font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]"
      >
        <RecDot /> Record a lesson
      </button>

      {/* The overlay is portaled to <body> so it centres on the whole viewport — the
          sidebar's `backdrop-blur` would otherwise trap a `fixed` child inside it.
          `open` is false on the server and on the first client render (nothing is
          picked and the recorder is idle), so the portal never runs during
          hydration and needs no "have I mounted yet" flag — just a guard for the
          server pass, where `document` doesn't exist. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 shadow-soft-md">
            {status === "idle" && (
              <>
                <div className="mb-1 font-display text-lg text-ink uppercase tracking-[.03em]">
                  Record a lesson
                </div>
                <p className="mb-4 text-sm text-ink-soft">Who is this lesson with?</p>

                {!quota.allowed ? (
                  // Caught here rather than after the lesson: /api/upload/complete
                  // would reject the upload anyway, and finding that out having
                  // just taught for an hour is the worst possible moment.
                  <div className="rounded-xl border border-brand-line bg-brand-soft/50 p-4 text-sm text-ink-soft">
                    {quota.trial ? (
                      <>
                        <div className="font-semibold text-ink">
                          You&apos;ve used your {quota.limit} free trial lessons
                        </div>
                        <p className="mt-1">
                          Choose a plan to keep recording lessons and building each
                          student&apos;s journey.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-ink">
                          You&apos;ve used all {quota.limit} lessons{" "}
                          {quota.rollover ? "this billing month" : "this month"}
                        </div>
                        <p className="mt-1">
                          {quota.paused
                            ? `Your ${quota.planName} plan is paused, so no new lessons are added this month. Resume it in Settings to keep recording.`
                            : `Your next allowance arrives on ${quota.renewsOn ?? "the 1st"}.`}
                        </p>
                      </>
                    )}
                    <Link
                      href="/dashboard/settings"
                      onClick={closeIdle}
                      className="mt-3 block rounded-full bg-cocoa px-4 py-2 text-center font-semibold text-butter uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]"
                    >
                      {quota.trial ? "Choose a plan" : "Upgrade plan"}
                    </Link>
                  </div>
                ) : students.length === 0 ? (
                  <div className="rounded-xl border border-line bg-white/60 p-4 text-sm text-ink-soft">
                    Add a student first, then you can record their lessons.
                    <Link
                      href="/dashboard/students/new"
                      onClick={closeIdle}
                      className="mt-3 block rounded-full bg-cocoa px-4 py-2 text-center font-semibold text-butter uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]"
                    >
                      Add a student
                    </Link>
                  </div>
                ) : (
                  <>
                    {showSearch && (
                      <div className="relative mb-2">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                          autoFocus
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search students…"
                          className="w-full rounded-xl border border-line bg-white/60 py-2 pl-10 pr-3 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-muted focus:border-brand-line"
                        />
                      </div>
                    )}
                    {filtered.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-muted">
                        No students match “{query.trim()}”.
                      </div>
                    ) : (
                      <div className="-mr-1 max-h-[11.25rem] space-y-1 overflow-y-auto pr-1">
                        {filtered.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => pick(s)}
                            className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-brand-line hover:bg-brand-soft/50"
                          >
                            <Avatar initial={s.initial} size={36} />
                            <span className="font-semibold text-ink">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {quota.allowed && students.length > 0 && (
                  <label className="mt-3 flex items-center gap-2 text-base font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={trial}
                      onChange={(e) => setTrial(e.target.checked)}
                      className="h-4 w-4 accent-[#412e28]"
                    />
                    This is a trial lesson — help fill in their profile
                  </label>
                )}

                {/* Only worth the space once the allowance is nearly gone. */}
                {quota.allowed && quota.trial ? (
                  <p className="mt-3 text-center text-xs text-muted">
                    {quota.remaining} of {quota.limit} free trial lessons left.
                  </p>
                ) : (
                  quota.allowed &&
                  quota.remaining <= 3 && (
                    <p className="mt-3 text-center text-xs text-muted">
                      {quota.remaining} of {quota.limit} lessons left this month on {quota.planName}.
                    </p>
                  )
                )}

                <button
                  onClick={closeIdle}
                  className="mt-4 w-full rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
                >
                  Cancel
                </button>
              </>
            )}

            {status === "recording" && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex items-center justify-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0605f] opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#e0605f]" />
                  </span>
                  <span className="font-semibold text-ink">Recording {firstName}’s lesson</span>
                </div>
                <div className="mb-1 font-mono text-3xl font-semibold tabular-nums text-ink">
                  {formatElapsed(elapsed)}
                </div>
                {warning && (
                  <p
                    role="alert"
                    className="mb-3 rounded-xl border border-[#e0605f]/40 bg-[#e0605f]/10 px-3 py-2 text-left text-sm font-semibold text-[#a8423e]"
                  >
                    {warning}
                  </p>
                )}
                <p className="mb-5 text-xs font-medium text-[#c0524e]">
                  Don&apos;t close this tab — BumbleNote hasn&apos;t saved the lesson yet.
                  Closing it now will lose the recording. Click Stop &amp; file lesson when
                  you&apos;re done.
                </p>
                <button
                  onClick={stop}
                  className="w-full rounded-xl bg-[#e0605f] px-6 py-3 font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
                  style={{ boxShadow: "0 10px 24px -10px rgba(224,96,95,.7)" }}
                >
                  ■ Stop &amp; file lesson
                </button>
              </div>
            )}

            {status === "processing" && (
              <div className="flex flex-col items-center py-4 text-center">
                <Spinner />
                <div className="mt-3 font-semibold text-ink">Transcribing &amp; drafting {firstName}’s lesson…</div>
                <p className="mt-1 text-xs text-ink-soft">
                  Separating the two voices and writing the feedback — a few seconds.
                </p>
                <p className="mt-2 text-xs font-medium text-[#c0524e]">
                  Don&apos;t close this tab yet — the lesson isn&apos;t saved until this finishes.
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="text-center">
                <div className="mb-1 font-semibold text-[#c0524e]">
                  {canRetry ? "The lesson didn’t finish processing" : "Recording didn’t go through"}
                </div>
                <p className="text-sm text-ink-soft">{error}</p>
                {canRetry && (
                  <p className="mt-1 text-xs text-muted">
                    Your recording is safe — try again now, or close this and pick it up from your dashboard later.
                  </p>
                )}
                {canRetry && (
                  <button
                    onClick={() => void retry()}
                    className="mt-5 w-full rounded-full bg-cocoa px-6 py-3 font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]"
                  >
                    Try again
                  </button>
                )}
                <button
                  onClick={closeIdle}
                  className={
                    canRetry
                      ? "mt-2 w-full rounded-xl border border-line px-6 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
                      : "mt-5 w-full rounded-xl bg-brand px-6 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5"
                  }
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function RecDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-7 w-7 animate-spin text-brand-deep" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}
