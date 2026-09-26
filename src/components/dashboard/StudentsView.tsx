"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import LevelBadge from "./LevelBadge";
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
      <div className="max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, goal, level…"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-10 pr-3 text-base text-ink outline-none transition-all duration-200 placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/30"
            />
          </div>
          <Link
            href="/dashboard/students/new"
            className="flex-none rounded-full bg-cocoa px-4 py-2.5 text-center text-sm font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 uppercase tracking-[.1em] hover:bg-cocoa-lift"
          >
            + Add student
          </Link>
        </div>

        <p className="mb-6 text-sm text-muted">
          {total} {total === 1 ? "learner" : "learners"}
          {query ? ` matching “${query.trim()}”` : " on your roster"}.
        </p>

        {total === 0 ? (
          <p className="border-y border-line py-6 text-base text-muted">
            {query.trim() ? `No students match “${query.trim()}”.` : "No students yet."}
          </p>
        ) : (
          <div className="space-y-10">
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
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand-deep">
          {count}
        </span>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {students.map((st) => (
          <li key={st.id}>
            <StudentRow student={st} muted={muted} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StudentRow({
  student: st,
  muted,
}: {
  student: Student;
  muted: boolean;
}) {
  return (
    <Link
      href={`/dashboard/students/${st.id}`}
      className={`group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors duration-200 hover:bg-brand-soft/40 ${
        muted ? "opacity-70" : ""
      }`}
    >
      <Avatar initial={st.initial} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink">{st.name}</span>
          {st.lessonCount === 0 ? (
            <span className="flex-none rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-brand-deep">
              New
            </span>
          ) : st.trend === "up" ? (
            <span className="hidden flex-none items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-xs font-semibold text-success-deep sm:inline-flex">
              <ArrowUpIcon size={11} /> Improving
            </span>
          ) : null}
        </div>
        <div className="truncate text-sm text-muted">
          {st.native} · {st.goal}
        </div>
      </div>

      <span className="hidden flex-none sm:inline-flex">
        <LevelBadge level={st.level} lessonCount={st.lessonCount} />
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
      <div className="font-display text-sm text-ink uppercase tracking-[.03em]">{n}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
