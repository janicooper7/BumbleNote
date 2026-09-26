"use client";

import { useSyncExternalStore } from "react";
import { dailyNote } from "@/lib/daily-note";

const noop = () => () => {};

// The same founders' note tutors see on their dashboard, shown to every
// visitor as one quiet line under the hero. The homepage is built once and
// served static, so the note is picked in the browser — picking it on the
// server would freeze it at the build date. The server snapshot is null so
// hydration matches the static HTML; the line then fades in.
export default function DailyNote() {
  const note = useSyncExternalStore(noop, () => dailyNote(), () => null);

  return (
    <section aria-label="Today's note from Millie and Jani" className="bg-white">
      <figure
        className={`mx-auto flex w-full max-w-[900px] items-center justify-center gap-4 px-5 pb-10 text-center transition-opacity duration-700 sm:px-8 ${
          note ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex flex-none -space-x-2" aria-hidden>
          {["M", "J"].map((i) => (
            <span
              key={i}
              className="grid h-9 w-9 place-items-center rounded-full bg-sky-soft font-display text-[.95rem] text-cocoa ring-2 ring-white"
            >
              {i}
            </span>
          ))}
        </div>
        <p className="min-w-0 text-[1.15rem] leading-snug text-ink-soft sm:text-[1.3rem]">
          <span className="italic">{note ? <>&ldquo;{note}&rdquo;</> : " "}</span>
          <span className="whitespace-nowrap text-muted"> — Millie &amp; Jani, co-founders</span>
        </p>
      </figure>
    </section>
  );
}
