"use client";

// Sidebar "Combine lessons" button, under "Record a lesson". Always available:
// the tutor picks a student, then ticks that student's unsent lessons to combine
// into one. Lessons are only ever listed one student at a time, so recordings of
// different students can't be mixed — and mergeSessions re-checks it anyway.

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { SearchIcon } from "./icons";
import { getMergeableLessons, mergeSessions } from "@/app/actions/merge";
import { MAX_MERGE_PARTS, MERGE_WINDOW_HOURS, type MergeCandidate } from "@/lib/merge";
import { MIN_COUNTED_LESSON_MIN, countsAsLesson } from "@/lib/plans";

type PickStudent = { id: string; name: string; initial: string };

const WINDOW_MS = MERGE_WINDOW_HOURS * 3_600_000;

export default function CombineLessonsButton({ students }: { students: PickStudent[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<PickStudent | null>(null);
  const [lessons, setLessons] = useState<MergeCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const showSearch = students.length > 3;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, query]);

  const picked = (lessons ?? []).filter((l) => selected.has(l.id));
  const pickedTimes = picked.map((l) => new Date(l.createdAt).getTime());
  const totalMin = picked.reduce((n, l) => n + l.durationMin, 0);

  /** Why a lesson can't be added to the current selection, or null if it can. */
  function blockedReason(l: MergeCandidate): string | null {
    if (selected.has(l.id) || picked.length === 0) return null;
    if (picked.length >= MAX_MERGE_PARTS) return `Up to ${MAX_MERGE_PARTS} at once`;
    const t = new Date(l.createdAt).getTime();
    const span = Math.max(t, ...pickedTimes) - Math.min(t, ...pickedTimes);
    return span > WINDOW_MS ? `Not within ${MERGE_WINDOW_HOURS}h` : null;
  }

  function close() {
    if (merging) return;
    reset();
  }

  function reset() {
    setOpen(false);
    setQuery("");
    setChosen(null);
    setLessons(null);
    setSelected(new Set());
    setError(null);
  }

  async function pickStudent(s: PickStudent) {
    setChosen(s);
    setLessons(null);
    setSelected(new Set());
    setError(null);
    // Ignore a slow response if the tutor has since gone back or picked someone else.
    const request = ++loadRequest.current;
    try {
      const rows = await getMergeableLessons(s.id);
      if (request === loadRequest.current) setLessons(rows);
    } catch {
      if (request !== loadRequest.current) return;
      setLessons([]);
      setError("Couldn't load the lessons — please try again.");
    }
  }

  function backToStudents() {
    loadRequest.current++;
    setChosen(null);
    setLessons(null);
    setSelected(new Set());
    setError(null);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function combine() {
    setMerging(true);
    setError(null);
    try {
      const result = await mergeSessions(picked.map((l) => l.id));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      router.push(`/dashboard/sessions/${result.id}`);
      router.refresh();
    } catch {
      setError("Couldn't combine the lessons — please try again.");
    } finally {
      setMerging(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-line bg-white/60 px-4 py-2.5 text-sm font-semibold text-brand-deep transition-colors duration-200 hover:bg-brand-soft/50"
      >
        <CombineIcon /> Combine lessons
      </button>

      {/* Portaled for the same reason as RecordLessonButton's overlay: the
          sidebar's backdrop-blur would trap a fixed child inside it. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 shadow-soft-md">
            {!chosen ? (
              <>
                <div className="mb-1 font-display text-lg font-medium text-ink">Combine lessons</div>
                <p className="mb-4 text-sm text-ink-soft">
                  Call dropped mid-lesson? Pick the student, then the recordings to turn into
                  one lesson and one report.
                </p>

                {students.length === 0 ? (
                  <div className="rounded-xl border border-line bg-white/60 p-4 text-sm text-ink-soft">
                    You don&apos;t have any students yet.
                  </div>
                ) : (
                  <>
                    {showSearch && (
                      <div className="relative mb-2">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                          autoFocus
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search students…"
                          className="w-full rounded-xl border border-line bg-white/60 py-2 pl-10 pr-3 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-muted focus:border-brand-line"
                        />
                      </div>
                    )}
                    {filtered.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-muted">
                        No students match “{query.trim()}”.
                      </div>
                    ) : (
                      <div className="-mr-1 max-h-[11.25rem] space-y-1 overflow-y-auto pr-1">
                        {filtered.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => void pickStudent(s)}
                            className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-brand-line hover:bg-brand-soft/50"
                          >
                            <Avatar initial={s.initial} size={36} />
                            <span className="font-semibold text-ink">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <button
                  onClick={close}
                  className="mt-4 w-full rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-3">
                  <Avatar initial={chosen.initial} size={36} />
                  <div className="min-w-0">
                    <div className="truncate font-display text-lg font-medium text-ink">
                      {chosen.name}
                    </div>
                    <div className="text-xs text-muted">
                      Unsent lessons · pick ones recorded within {MERGE_WINDOW_HOURS} hours of each
                      other
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  {lessons === null ? (
                    <div className="px-3 py-8 text-center text-sm text-muted">Loading lessons…</div>
                  ) : lessons.length < 2 ? (
                    <div className="rounded-xl border border-line bg-white/60 p-4 text-sm text-ink-soft">
                      {chosen.name.split(" ")[0]} needs at least two unsent lessons to combine.
                    </div>
                  ) : (
                    <ul className="-mr-1 flex max-h-[16rem] flex-col gap-1.5 overflow-y-auto pr-1">
                      {lessons.map((l) => {
                        const blocked = blockedReason(l);
                        const at = new Date(l.createdAt);
                        return (
                          <li key={l.id}>
                            <label
                              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                                selected.has(l.id)
                                  ? "border-brand-line bg-brand-soft/50"
                                  : "border-line bg-white/60"
                              } ${blocked || merging ? "opacity-50" : "cursor-pointer hover:bg-brand-soft/40"}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(l.id)}
                                disabled={!!blocked || merging}
                                onChange={() => toggle(l.id)}
                                className="h-4 w-4 accent-[#d28c00]"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-ink" title={l.title}>
                                  {l.title}
                                </span>
                                <span className="block text-xs text-muted" suppressHydrationWarning>
                                  {at.toLocaleDateString([], { day: "numeric", month: "short" })} ·{" "}
                                  {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                                  {l.durationMin} min
                                </span>
                              </span>
                              {blocked && <span className="flex-none text-xs text-muted">{blocked}</span>}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {lessons && lessons.length >= 2 && (
                  <div className="mt-3 text-sm text-ink-soft">
                    {picked.length < 2 ? (
                      "Pick at least two lessons."
                    ) : (
                      <>
                        <strong className="text-ink">{totalMin} min</strong> combined ·{" "}
                        {countsAsLesson(totalMin)
                          ? "uses 1 lesson credit"
                          : `under ${MIN_COUNTED_LESSON_MIN} min, so no credit used`}
                      </>
                    )}
                  </div>
                )}

                {error && <p className="mt-2 text-sm text-[#c0524e]">{error}</p>}

                {lessons && lessons.length >= 2 && (
                  <p className="mt-2 text-xs text-muted">
                    The feedback is rewritten as one lesson and the separate recordings are
                    removed. Attachments are kept. Save any open edits first.
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={backToStudents}
                    disabled={merging}
                    className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => void combine()}
                    disabled={picked.length < 2 || merging}
                    className="flex-[2] rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {merging
                      ? "Combining… (about a minute)"
                      : picked.length >= 2
                        ? `Combine ${picked.length} lessons`
                        : "Combine lessons"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function CombineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3v5a4 4 0 0 0 4 4 4 4 0 0 1 4 4v5" />
      <path d="M16 3v5a4 4 0 0 1-4 4" />
    </svg>
  );
}
