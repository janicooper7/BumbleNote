"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { ArrowUpIcon, ChevronRightIcon, SearchIcon } from "./icons";
import type { Student } from "@/lib/mock";

export default function StudentsView({ list }: { list: Student[] }) {
  const [query, setQuery] = useState("");

  const { active, inactive } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? list.filter((st) =>
          [st.name, st.goal, st.native, st.level].some((field) =>
            field.toLowerCase().includes(q),
          ),
        )
      : list;
    return {
      active: matches.filter((st) => st.active !== false),
      inactive: matches.filter((st) => st.active === false),
    };
  }, [list, query]);

  const total = active.length + inactive.length;

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, goal, level…"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-sm text-ink shadow-soft-sm outline-none transition-colors duration-200 placeholder:text-muted focus:border-brand-line"
          />
        </div>
        <Link
          href="/dashboard/students/new"
          className="flex-none rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-semibold text-ink shadow-soft-sm transition-all duration-300 hover:-translate-y-0.5"
        >
          + Add student
        </Link>
      </div>

      <p className="mb-5 text-sm text-ink-soft">
        {total} {total === 1 ? "learner" : "learners"}
        {query ? ` matching “${query.trim()}”` : " on your roster"}.
      </p>

      {total === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-4 py-14 text-center text-sm text-muted shadow-soft-sm">
          No students match “{query.trim()}”.
        </div>
      ) : (
        <div className="space-y-8">
          <StudentSection
            title="Active"
            count={active.length}
            students={active}
          />
          {inactive.length > 0 && (
            <StudentSection
              title="Inactive"
              count={inactive.length}
              students={inactive}
              muted
            />
          )}
        </div>
      )}
    </div>
  );
}

function StudentSection({
  title,
  count,
  students,
  muted = false,
}: {
  title: string;
  count: number;
  students: Student[];
  muted?: boolean;
}) {
  if (students.length === 0) return null;

  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
          {count}
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm">
        {students.map((st, i) => (
          <StudentRow key={st.id} student={st} first={i === 0} muted={muted} />
        ))}
      </div>
    </section>
  );
}

function StudentRow({
  student: st,
  first,
  muted,
}: {
  student: Student;
  first: boolean;
  muted: boolean;
}) {
  return (
    <Link
      href={`/dashboard/students/${st.id}`}
      className={`group flex items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-brand-soft/40 ${
        first ? "" : "border-t border-line"
      } ${muted ? "opacity-70" : ""}`}
    >
      <Avatar initial={st.initial} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink">{st.name}</span>
          {st.lessonCount === 0 ? (
            <span className="flex-none rounded-full bg-amber/12 px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
              New
            </span>
          ) : st.trend === "up" ? (
            <span className="hidden flex-none items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success-deep sm:inline-flex">
              <ArrowUpIcon size={11} /> Improving
            </span>
          ) : null}
        </div>
        <div className="truncate text-sm text-muted">
          {st.native} · {st.goal}
        </div>
      </div>

      <span className="hidden flex-none rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-deep sm:inline-block">
        {st.level}
      </span>

      <div className="hidden flex-none items-center gap-6 md:flex">
        <RowStat n={st.lessonCount} label="lessons" />
        <RowStat n={st.vocabCount} label="vocab" />
        <RowStat n={st.lastSeen} label="last seen" />
      </div>

      <ChevronRightIcon className="flex-none text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand-deep" />
    </Link>
  );
}

function RowStat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="w-16 text-right">
      <div className="font-display text-sm font-semibold text-ink">{n}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
