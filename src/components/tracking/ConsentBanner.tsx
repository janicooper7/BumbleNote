"use client";

// The cookie banner. Shown until the visitor chooses, and again whenever a
// "Cookie settings" link asks for it. Both choices are one click and equally
// prominent, as the ICO expects: declining must be as easy as accepting.

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ConsentChoice } from "@/lib/tracking";
import { getConsent, OPEN_SETTINGS_EVENT, setConsent, subscribeConsent } from "./consent";

export default function ConsentBanner() {
  // The server snapshot says "chosen", so the banner never flashes in the
  // server HTML; it slides in after hydration for anyone who hasn't chosen.
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => "essential" as const);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  if (consent && !reopened) return null;

  const choose = (choice: ConsentChoice) => {
    setReopened(false);
    setConsent(choice);
  };

  const button =
    "flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md sm:flex-none";

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex max-w-3xl animate-[ct-rise_.5s_var(--ease-smooth)_both] flex-col gap-4 rounded-2xl border border-line bg-white/95 p-5 shadow-soft-lg backdrop-blur sm:px-6">
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Cookies.</span> We use essential cookies to run
          BumbleNote. With your permission, we&apos;d also use marketing cookies, including
          Meta&apos;s, to see which of our ads bring tutors here. You can change your mind any time
          from &ldquo;Cookie settings&rdquo; at the bottom of the page. Read our{" "}
          <Link
            href="/privacy#cookies"
            className="font-semibold text-brand-deep underline decoration-brand-line underline-offset-2 transition-colors hover:decoration-brand-deep"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex gap-3 sm:justify-end">
          <button
            type="button"
            onClick={() => choose("essential")}
            className={`${button} border border-ink bg-white text-ink`}
          >
            Essential only
          </button>
          <button type="button" onClick={() => choose("marketing")} className={`${button} bg-ink text-white`}>
            Accept marketing cookies
          </button>
        </div>
      </div>
    </div>
  );
}
