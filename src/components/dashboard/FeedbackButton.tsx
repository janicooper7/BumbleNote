"use client";

// "Get in touch": problems, feedback and questions alike. Opens a small dialog
// whose message is emailed to the operator (actions/feedback). On desktop it's a
// sidebar item under the guides; below md, where the sidebar is hidden, it's a
// floating pill bottom-right instead. The pending-uploads card shares that
// corner and sits above it (z-40) while shown.

import { useEffect, useState } from "react";
import DashPortal from "./DashPortal";
import { usePathname } from "next/navigation";
import { sendFeedback } from "@/app/actions/feedback";
import type { ContactTopic } from "@/lib/email";

type Phase = "idle" | "sending" | "sent";

// Optional tag, so problem reports stand out in the inbox. Each carries its own
// prompt, since "what went wrong" and "what could be better" want different answers.
const TOPICS: { id: ContactTopic; label: string; placeholder: string }[] = [
  {
    id: "problem",
    label: "Something's wrong",
    placeholder: "What happened, and what were you trying to do?",
  },
  { id: "feedback", label: "Feedback", placeholder: "What would make BumbleNote better for you?" },
  { id: "question", label: "A question", placeholder: "What would you like to know?" },
];

// The speech bubble above the pill that invites feedback. Dismissing it (or
// sending feedback) quiets it for a fortnight, so it encourages without nagging.
const NUDGE_KEY = "bn-feedback-nudge-hidden-at";
const NUDGE_QUIET_MS = 14 * 24 * 60 * 60 * 1000;
const NUDGE_DELAY_MS = 1500;

function hideNudge() {
  try {
    localStorage.setItem(NUDGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode): the bubble just comes back next visit.
  }
}

export default function FeedbackButton({ inSidebar = false }: { inSidebar?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [topic, setTopic] = useState<ContactTopic | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);

  // Read storage after mount, so the server render and first paint agree; the
  // short delay lets the page settle before the bubble pops in.
  useEffect(() => {
    if (inSidebar) return;
    let hiddenAt = 0;
    try {
      hiddenAt = Number(localStorage.getItem(NUDGE_KEY)) || 0;
    } catch {}
    if (Date.now() - hiddenAt < NUDGE_QUIET_MS) return;
    const t = setTimeout(() => setNudge(true), NUDGE_DELAY_MS);
    return () => clearTimeout(t);
  }, [inSidebar]);

  function dismissNudge() {
    setNudge(false);
    hideNudge();
  }

  function openDialog() {
    dismissNudge();
    setOpen(true);
  }

  function close() {
    if (phase === "sending") return;
    setOpen(false);
    setError(null);
    // Keep an unsent draft in case the dialog was closed by accident.
    if (phase === "sent") {
      setMessage("");
      setTopic(null);
      setPhase("idle");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("sending");
    setError(null);
    try {
      const result = await sendFeedback({ message, page: pathname, topic: topic ?? undefined });
      if (result.ok) {
        setPhase("sent");
        hideNudge();
        return;
      }
      setError(result.error);
    } catch {
      setError("Couldn't send that — please try again.");
    }
    setPhase("idle");
  }

  return (
    <>
      {nudge && !open && (
        <div className="fixed bottom-[3.9rem] right-4 z-30 md:hidden motion-safe:animate-[bn-nudge-in_.4s_var(--ease-smooth)_both]">
          <div className="relative flex items-center rounded-full border border-sky bg-white py-1 pl-3.5 pr-1 shadow-soft-md">
            <button onClick={openDialog} className="text-sm font-medium text-ink">
              Need help or have feedback?
            </button>
            <button
              onClick={dismissNudge}
              aria-label="Hide this tip"
              className="ml-1 grid h-6 w-6 place-items-center rounded-full text-muted transition-colors hover:bg-sky-soft hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            {/* The tail, pointing down at the pill. */}
            <span
              aria-hidden="true"
              className="absolute -bottom-[5px] right-9 h-2.5 w-2.5 rotate-45 border-b border-r border-sky bg-white"
            />
          </div>
        </div>
      )}

      {inSidebar ? (
        <button
          type="button"
          onClick={openDialog}
          className="group flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-[.875rem] font-medium uppercase tracking-[.16em] text-ink-soft transition-all duration-200 hover:bg-butter-soft hover:text-cocoa"
        >
          <ChatIcon size={20} className="text-muted transition-colors group-hover:text-cocoa" />
          Get in touch
        </button>
      ) : (
      <button
        onClick={openDialog}
        className="fixed bottom-4 right-4 z-30 flex md:hidden items-center gap-2 rounded-full bg-cocoa px-4 py-2.5 text-[.8rem] font-semibold uppercase tracking-[.1em] text-butter shadow-soft-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-cocoa-lift"
      >
        <ChatIcon /> Get in touch
      </button>
      )}

      {/* Portaled to <body>: inside the sticky sidebar the overlay would be
          trapped in its stacking context, under the page's own layers. `open`
          is false on the server, so this never runs during hydration. */}
      {open && typeof document !== "undefined" && (
        <DashPortal>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && close()}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 shadow-soft-md"
          >
            {phase === "sent" ? (
              <>
                <div id="feedback-title" className="mb-1 font-display text-lg uppercase tracking-[.03em] text-ink">
                  Thank you!
                </div>
                <p className="mb-5 text-sm text-ink-soft">
                  Your message is on its way. We read every one, and we&apos;ll reply by email
                  {topic === "problem" ? " as soon as we can" : " if there's anything to follow up on"}.
                </p>
                <button
                  autoFocus
                  onClick={close}
                  className="w-full rounded-full bg-cocoa px-4 py-2.5 text-[.85rem] font-semibold uppercase tracking-[.1em] text-butter hover:bg-cocoa-lift"
                >
                  Done
                </button>
              </>
            ) : (
              <form onSubmit={submit}>
                <div id="feedback-title" className="mb-1 font-display text-lg uppercase tracking-[.03em] text-ink">
                  Get in touch
                </div>
                <p className="mb-4 text-sm text-ink-soft">
                  Something not working, feedback, or a question? It goes straight to us, and
                  we&apos;ll reply by email.
                </p>
                <div role="radiogroup" aria-label="What's it about?" className="mb-3 flex flex-wrap gap-2">
                  {TOPICS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={topic === t.id}
                      onClick={() => setTopic(topic === t.id ? null : t.id)}
                      disabled={phase === "sending"}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        topic === t.id
                          ? "border-cocoa bg-cocoa text-butter"
                          : "border-line text-ink-soft hover:border-sky-deep hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  autoFocus
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={4000}
                  rows={6}
                  disabled={phase === "sending"}
                  placeholder={TOPICS.find((t) => t.id === topic)?.placeholder ?? "What's on your mind?"}
                  className="w-full resize-y rounded-xl border border-line bg-white/60 px-3.5 py-3 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-muted focus:border-brand-line"
                />
                {error && <p className="mt-2 text-sm text-[#b3261e]">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={phase === "sending"}
                    className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={phase === "sending" || !message.trim()}
                    className="flex-1 rounded-full bg-cocoa px-4 py-2.5 text-[.85rem] font-semibold uppercase tracking-[.1em] text-butter transition-colors hover:bg-cocoa-lift disabled:opacity-50"
                  >
                    {phase === "sending" ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
        </DashPortal>
      )}
    </>
  );
}

// 16px in the pill; 20px with the lighter stroke to match the sidebar's icons.
function ChatIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={size > 16 ? 1.8 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
