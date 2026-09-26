"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { ChevronRightIcon } from "./icons";
import { splitLessonTitle, type Session, type SessionStatus } from "@/lib/mock";

const PREVIEW_COUNT = 3;

// Each bucket owns one status colour, used on its icon, its count and the bar
// down the side of its list, so the three read apart at a glance. Full class
// strings, so Tailwind can see them.
const TONES: Record<SessionStatus, { badge: string; bar: string; icon: React.ReactNode }> = {
  draft: {
    badge: "bg-danger/12 text-danger-deep",
    bar: "border-l-danger",
    icon: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  },
  confirmed: {
    badge: "bg-info/12 text-info-deep",
    bar: "border-l-info",
    icon: <path d="M20 6 9 17l-5-5" />,
  },
  sent: {
    badge: "bg-success/12 text-success-deep",
    bar: "border-l-success",
    icon: <path d="m22 2-7 20-4-9-9-4Zm0 0L11 13" />,
  },
};

/**
 * One status bucket of the lessons list, collapsed to the first few rows.
 * `nested` is for the overview, where it sits under its own section heading:
 * an h3 instead of an h2, and an empty bucket is left out rather than shown.
 */
export default function LessonSection({
  status,
  title,
  hint,
  empty,
  sessions,
  nested = false,
}: {
  status: SessionStatus;
  title: string;
  hint: string;
  empty: string;
  sessions: Session[];
  nested?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = TONES[status];
  const Heading = nested ? "h3" : "h2";

  if (nested && sessions.length === 0) return null;

  const hidden = sessions.length - PREVIEW_COUNT;
  const visible = expanded ? sessions : sessions.slice(0, PREVIEW_COUNT);

  return (
    <section className={nested ? "pt-6 first:pt-2" : "py-8 first:pt-0"}>
      <header className="mb-4 flex items-center gap-3">
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${tone.badge}`}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {tone.icon}
          </svg>
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Heading className="text-lg font-semibold text-ink">{title}</Heading>
            <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${tone.badge}`}>
              {sessions.length}
            </span>
          </div>
          <p className="text-sm text-muted">{hint}</p>
        </div>
      </header>

      {sessions.length === 0 ? (
        <p className={`border-l-[3px] ${tone.bar} py-2 pl-4 text-base text-muted`}>{empty}</p>
      ) : (
        <ul className={`divide-y divide-line border-l-[3px] ${tone.bar}`}>
          {visible.map((s) => {
            const { label, topic } = splitLessonTitle(s.title);
            const meta = [topic, label, `${s.durationMin} min`].filter(Boolean).join(" · ");
            return (
              <li key={s.id}>
                <Link
                  href={`/dashboard/sessions/${s.id}`}
                  className="group flex items-center gap-4 py-3.5 pl-4 pr-2 transition-colors hover:bg-brand-soft/40"
                >
                  <Avatar initial={s.studentInitial} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink">{s.studentName}</div>
                    <div className="truncate text-sm text-muted">{meta}</div>
                  </div>
                  {/* A fixed column, so dates line up down the list. */}
                  <div className="hidden w-28 flex-none text-right text-sm text-ink-soft tabular-nums sm:block">
                    {s.date}
                  </div>
                  <ChevronRightIcon className="flex-none text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand-deep" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 pl-[19px] text-sm font-semibold text-brand-deep hover:underline"
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </section>
  );
}
