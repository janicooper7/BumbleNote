"use client";

// The "Record this session" CTA on a student's page. Student is already known,
// so it drives the shared recorder hook directly.

import { useSessionRecorder, formatElapsed } from "./useSessionRecorder";

export default function SessionRecorder({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const { status, elapsed, error, canRetry, start, stop, retry, reset } = useSessionRecorder();
  const firstName = studentName.split(" ")[0];

  return (
    <div className="rounded-2xl border border-brand-line bg-gradient-to-br from-brand-soft/70 to-white p-5 shadow-soft-sm">
      {status === "idle" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-lg font-medium text-ink">
              Record this session with {firstName}
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">
              Captures your lesson tab’s audio and your mic, then transcribes and drafts the
              lesson for you — no files, no setup.
            </p>
          </div>
          <button
            onClick={() => start(studentId)}
            className="inline-flex flex-none items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5"
            style={{ boxShadow: "0 10px 24px -10px rgba(210,140,0,.6)" }}
          >
            <MicIcon /> Record a session
          </button>
        </div>
      )}

      {status === "recording" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <RecDot />
            <div>
              <div className="font-semibold text-ink">
                Recording · <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
              </div>
              <p className="text-xs text-ink-soft">
                Keep your lesson tab open and shared. Stop when the lesson ends.
              </p>
            </div>
          </div>
          <button
            onClick={stop}
            className="inline-flex flex-none items-center justify-center gap-2 rounded-xl bg-[#e0605f] px-6 py-3 font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{ boxShadow: "0 10px 24px -10px rgba(224,96,95,.7)" }}
          >
            ■ Stop &amp; file lesson
          </button>
        </div>
      )}

      {status === "processing" && (
        <div className="flex items-center gap-3">
          <Spinner />
          <div>
            <div className="font-semibold text-ink">Transcribing &amp; drafting {firstName}’s lesson…</div>
            <p className="text-xs text-ink-soft">Separating the two voices and writing the feedback — a few seconds.</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-[#c0524e]">
              {canRetry ? "The lesson didn’t finish processing" : "Recording didn’t go through"}
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">{error}</p>
            {canRetry && (
              <p className="mt-1 text-xs text-muted">
                Your recording is safe — try again without re-recording.
              </p>
            )}
          </div>
          <div className="flex flex-none gap-2">
            {canRetry && (
              <button
                onClick={reset}
                className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
              >
                Dismiss
              </button>
            )}
            <button
              onClick={canRetry ? retry : reset}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5"
            >
              {canRetry ? "Try again" : "Start over"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
    </svg>
  );
}

function RecDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0605f] opacity-70" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-[#e0605f]" />
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-6 w-6 flex-none animate-spin text-brand-deep" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}
