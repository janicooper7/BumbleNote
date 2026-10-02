"use client";

import { useSyncExternalStore } from "react";
import { LAUNCH_AT } from "@/lib/launch";

// Days / hours / minutes / seconds to launch, for the pre-launch page.
//
// The clock is an external store ticking once a second. During hydration React
// uses the server snapshot — the `serverNow` the page rendered with — so the
// first client render matches the HTML exactly, then it switches to the live
// clock. No placeholder flash, no hydration mismatch.

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

// Whole seconds, so the snapshot only changes when the display would.
const nowSeconds = () => Math.floor(Date.now() / 1000);

const pad = (n: number) => String(n).padStart(2, "0");

export default function LaunchCountdown({ serverNow }: { serverNow: number }) {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => Math.floor(serverNow / 1000));
  const left = Math.max(0, Math.floor(LAUNCH_AT.getTime() / 1000) - now);

  if (left === 0) {
    return (
      <p className="font-display text-[clamp(1.6rem,4vw,2.4rem)] uppercase text-cocoa">
        The doors are opening
      </p>
    );
  }

  const units = [
    { label: "Days", value: Math.floor(left / 86400) },
    { label: "Hours", value: Math.floor(left / 3600) % 24 },
    { label: "Minutes", value: Math.floor(left / 60) % 60 },
    { label: "Seconds", value: left % 60 },
  ];

  return (
    // role="timer" is implicitly aria-live="off": a screen reader shouldn't
    // announce every second. The sr-only line gives the moment itself.
    <div role="timer" aria-label="Time until launch">
      <span className="sr-only">Launching Sunday 4 October 2026 at 9am UK time.</span>
      <ol aria-hidden className="grid grid-cols-4 gap-2 sm:gap-4">
        {units.map((u) => (
          <li
            key={u.label}
            className="flex flex-col items-center rounded-[22px] bg-butter-soft px-2 py-4 ring-1 ring-line sm:rounded-[28px] sm:px-4 sm:py-6"
          >
            <span className="font-display text-[clamp(2.2rem,7vw,4.2rem)] leading-none tabular-nums text-cocoa">
              {pad(u.value)}
            </span>
            <span className="mt-2 text-[.62rem] font-semibold uppercase tracking-[.18em] text-ink-soft sm:mt-3 sm:text-[.75rem]">
              {u.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
