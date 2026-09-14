"use client";

// Site-wide privacy notice.
//
// Informational, not a consent prompt: BumbleNote sets only strictly necessary
// cookies (see the "cookies" clause of /privacy), so there is nothing to accept
// or reject under PECR. Offering "Reject" would imply optional tracking exists.
// The notice just tells visitors what is collected and where the policy is.
//
// Dismissal is remembered in localStorage — a record of the visitor's own
// request to hide the notice, which is exempt from consent itself.

import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "bn_privacy_notice_v1";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked — the notice will simply return next visit.
  }
  listeners.forEach((cb) => cb());
}

export default function PrivacyNotice() {
  // The server snapshot says "dismissed" so the notice never flashes in the
  // server HTML for returning visitors; it slides in after hydration instead.
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);
  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Privacy notice"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex max-w-3xl animate-[ct-rise_.5s_var(--ease-smooth)_both] flex-col gap-4 rounded-2xl border border-line bg-white/95 p-5 shadow-soft-lg backdrop-blur sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Your privacy.</span> We collect personal
          data such as your email address only to run BumbleNote and, if you join the
          waitlist, to tell you when we launch. We use essential cookies only — no
          analytics or tracking. Read our{" "}
          <Link
            href="/privacy"
            className="font-semibold text-brand-deep underline decoration-brand-line underline-offset-2 transition-colors hover:decoration-brand-deep"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="flex-none rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
