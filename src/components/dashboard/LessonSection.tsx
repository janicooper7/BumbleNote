"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { ChevronRightIcon } from "./icons";
import { splitLessonTitle, type Session } from "@/lib/mock";

const PREVIEW_COUNT = 3;

/** One status bucket of the lessons list, collapsed to the first few rows. */
export default function LessonSection({
  title,
  pill,
  hint,
  sessions,
}: {
  title: string;
  pill: string;
  hint: string;
  sessions: Session[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (sessions.length === 0) return null;

  const hidden = sessions.length - PREVIEW_COUNT;
  const visible = expanded ? sessions : sessions.slice(0, PREVIEW_COUNT);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${pill}`}>
          {sessions.length}
        </span>
        <span className="text-[15px] text-muted">{hint}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm">
        {visible.map((s, i) => {
          const { label, topic } = splitLessonTitle(s.title);
          const meta = [label, `${s.durationMin} min`].filter(Boolean).join(" · ");
          return (
            <Link
              key={s.id}
              href={`/dashboard/sessions/${s.id}`}
              className={`group flex items-center gap-4 p-5 transition-colors hover:bg-brand-soft/40 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <Avatar initial={s.studentInitial} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">
                  {s.studentName} · {s.date} · {topic}
                </div>
                <div className="text-sm text-muted">{meta}</div>
              </div>
              <ChevronRightIcon className="flex-none text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand-deep" />
            </Link>
          );
        })}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full border-t border-line px-5 py-3 text-sm font-semibold text-brand-deep transition-colors duration-200 hover:bg-brand-soft/40"
          >
            {expanded ? "Show less" : `Show ${hidden} more`}
          </button>
        )}
      </div>
    </section>
  );
}
