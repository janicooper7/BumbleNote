"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { ChevronRightIcon } from "./icons";
import type { Session } from "@/lib/mock";

const PREVIEW_COUNT = 3;

/**
 * The home-page queue: drafts the tutor still has to read, then confirmed
 * lessons that are only waiting to be sent. Each group collapses to a few rows.
 */
export default function PendingQueue({ sessions }: { sessions: Session[] }) {
  return (
    <div className="flex flex-col gap-6">
      <QueueSection
        title="Needs review"
        pill="bg-danger/12 text-danger-deep"
        sessions={sessions.filter((s) => s.status === "draft")}
      />
      <QueueSection
        title="Ready to send to student"
        pill="bg-info/12 text-info-deep"
        sessions={sessions.filter((s) => s.status === "confirmed")}
      />
    </div>
  );
}

function QueueSection({
  title,
  pill,
  sessions,
}: {
  title: string;
  pill: string;
  sessions: Session[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (sessions.length === 0) return null;

  const hidden = sessions.length - PREVIEW_COUNT;
  const visible = expanded ? sessions : sessions.slice(0, PREVIEW_COUNT);

  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill}`}>
          {sessions.length}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/sessions/${s.id}`}
            className="group flex items-center gap-4 rounded-xl border border-line bg-white/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-line hover:shadow-soft-sm"
          >
            <Avatar initial={s.studentInitial} size={46} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink">{s.studentName}</div>
              <div className="truncate text-sm text-ink-soft">{s.title}</div>
              <div className="mt-1 text-xs text-muted">
                {s.date} · {s.durationMin} min
              </div>
            </div>
            <ChevronRightIcon className="flex-none text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand-deep" />
          </Link>
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full rounded-xl border border-dashed border-line px-4 py-2.5 text-sm font-semibold text-brand-deep transition-colors duration-200 hover:bg-brand-soft/40"
          >
            {expanded ? "Show less" : `Show ${hidden} more`}
          </button>
        )}
      </div>
    </section>
  );
}
