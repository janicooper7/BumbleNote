"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import LevelBadge from "./LevelBadge";
import SessionRecorder from "./SessionRecorder";
import StatusBadge from "./StatusBadge";
import { ChevronRightIcon } from "./icons";
import { sortSessions, splitLessonTitle, type Session, type Student } from "@/lib/mock";
import { buildJourney, warmUpTerms, type JourneyFocus, type Trajectory } from "@/lib/journey";
import { GOALS, LEVEL_DETERMINATION_LESSONS, LEVELS, isLevelDetermined } from "@/lib/student-options";
import {
  deleteStudent,
  setStudentActive,
  setStudentEmail,
  setStudentNotes,
  updateStudentProfile,
} from "@/app/actions/students";
import { setSessionTitle } from "@/app/actions/sessions";

type ProfileDraft = {
  name: string;
  level: string;
  goal: string;
  native: string;
  targetExam: string;
  interests: string;
  focus: string;
  hourlyRate: string;
};

function draftFromStudent(s: Student): ProfileDraft {
  return {
    name: s.name,
    level: s.level,
    goal: s.goal,
    native: s.native,
    targetExam: s.targetExam ?? "",
    interests: (s.interests ?? []).join(", "),
    focus: s.focus.join(", "),
    hourlyRate: s.hourlyRate != null ? String(s.hourlyRate) : "",
  };
}

function splitList(v: string) {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function StudentDetailView({
  student,
  initialHistory,
}: {
  student: Student;
  initialHistory: Session[];
}) {
  const router = useRouter();
  // Server props are the source of truth; local state gives snappy optimistic
  // updates while the Server Actions persist + revalidate in the background.
  const [active, setActive] = useState(student.active !== false);
  const [email, setEmail] = useState(student.email ?? "");
  const [emailSaved, setEmailSaved] = useState(false);
  const [notes, setNotes] = useState(student.notes ?? "");
  const [history, setHistory] = useState<Session[]>(initialHistory);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // The editable core profile fields — name, level, goal, etc. Kept as their
  // own snapshot so cancelling an edit reverts to what's actually saved rather
  // than whatever was mid-typed.
  const [profile, setProfile] = useState(student);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() => draftFromStudent(student));
  const [savingProfile, setSavingProfile] = useState(false);

  function startEditingProfile() {
    setProfileDraft(draftFromStudent(profile));
    setEditingProfile(true);
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const name = profileDraft.name.trim();
      const hourlyRate = profileDraft.hourlyRate.trim();
      const rate = hourlyRate ? parseFloat(hourlyRate) : null;
      const input = {
        name: name || profile.name,
        level: profileDraft.level,
        goal: profileDraft.goal,
        native: profileDraft.native,
        targetExam: profileDraft.targetExam,
        interests: splitList(profileDraft.interests),
        focus: splitList(profileDraft.focus),
        hourlyRate: rate != null && Number.isFinite(rate) ? rate : null,
      };
      await updateStudentProfile(student.id, input);
      setProfile((prev) => ({
        ...prev,
        name: input.name,
        initial: (input.name[0] || "?").toUpperCase(),
        level: input.level,
        goal: input.goal,
        native: input.native.trim() || "—",
        targetExam: input.targetExam || undefined,
        interests: input.interests,
        focus: input.focus,
        hourlyRate: input.hourlyRate ?? undefined,
      }));
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteStudent(student.id);
      router.push("/dashboard/students");
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  function toggleActive() {
    const next = !active;
    setActive(next);
    void setStudentActive(student.id, next);
  }

  async function saveNotes() {
    await setStudentNotes(student.id, notes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  async function saveEmail() {
    if (email.trim() === (student.email ?? "")) return;
    await setStudentEmail(student.id, email);
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2000);
  }

  function saveTitle(sessionId: string) {
    const topic = editTitle.trim();
    if (topic) {
      const current = history.find((s) => s.id === sessionId);
      const label = current ? splitLessonTitle(current.title).label : "";
      const full = label ? `${label} · ${topic}` : topic;
      setHistory((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: full } : s)));
      void setSessionTitle(sessionId, full);
    }
    setEditingId(null);
  }

  const firstName = profile.name.split(" ")[0];
  const sortedHistory = sortSessions(history, "date");

  // The cumulative view across every taught lesson — recurring themes, the vocab
  // bank, the level trend. Derived here rather than fetched: the page already
  // holds the full history, and `history` is local state (lesson titles are
  // edited in place below), so recomputing keeps the panel honest after an edit.
  const journey = useMemo(() => buildJourney(history), [history]);
  const lessonsTaught = journey.lessonsTaught;

  // Lead with the most persistent open theme, since that's the one costing the
  // student most. Before any lesson is taught, fall back to the tutor's own
  // starting notes from the student profile.
  const leadFocus = journey.activeFocus[0];
  const recommendedFocus = leadFocus?.label ?? profile.focus[0];
  const warmUp = warmUpTerms(journey);
  const recurringVocab = journey.vocab.filter((v) => v.lessons > 1).slice(0, 8);

  return (
    <div className="px-6 py-8 lg:px-10">
      <Link href="/dashboard/students" className="text-sm font-medium text-brand-deep hover:underline">
        ← All students
      </Link>

      {active && (
        <div className="mt-4">
          <SessionRecorder studentId={student.id} studentName={profile.name} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* profile */}
        <section className="h-fit rounded-2xl border border-line bg-surface p-6 shadow-soft-sm">
          <div className="flex items-start gap-4">
            <Avatar initial={profile.initial} size={60} />
            <div className="min-w-0 flex-1">
              {editingProfile ? (
                <input
                  autoFocus
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Student name"
                  className="w-full rounded-lg border border-brand-line bg-white px-3 py-1.5 font-display text-xl font-medium text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                />
              ) : (
                <div className="truncate font-display text-xl font-medium text-ink">{profile.name}</div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {editingProfile ? (
                  <select
                    value={profileDraft.level}
                    onChange={(e) => setProfileDraft((d) => ({ ...d, level: e.target.value }))}
                    title={
                      !isLevelDetermined(lessonsTaught)
                        ? `A starting guess — BumbleNote confirms the real level after ${LEVEL_DETERMINATION_LESSONS} taught lessons.`
                        : undefined
                    }
                    className="rounded-lg border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-brand-deep outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                  >
                    {(LEVELS.includes(profileDraft.level) ? LEVELS : [profileDraft.level, ...LEVELS]).map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <LevelBadge level={profile.level} lessonCount={lessonsTaught} />
                )}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    active ? "bg-success/12 text-success-deep" : "bg-line text-ink-soft"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-success" : "bg-muted"}`} />
                  {active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            {editingProfile ? (
              <div className="flex flex-none flex-col gap-1.5">
                <button
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {savingProfile ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingProfile(false)}
                  disabled={savingProfile}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={startEditingProfile}
                className="flex-none rounded-lg border border-brand-line bg-white/70 px-3 py-1.5 text-xs font-semibold text-brand-deep transition-all duration-200 hover:-translate-y-0.5"
              >
                Edit
              </button>
            )}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Email</div>
              {emailSaved && <span className="text-xs font-semibold text-mint">Saved ✓</span>}
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={saveEmail}
              placeholder="student@email.com"
              className="mt-2 w-full rounded-xl border border-brand-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-all focus:border-brand focus:ring-4 focus:ring-brand/30"
            />
            <p className="mt-1.5 text-xs text-muted">Where lesson-report PDFs are sent.</p>
          </div>

          {editingProfile ? (
            <div className="mt-6 flex flex-col gap-3.5 border-t border-line pt-5">
              <EditField label="Goal">
                <select
                  value={profileDraft.goal}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, goal: e.target.value }))}
                  className="w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                >
                  {(GOALS.includes(profileDraft.goal) ? GOALS : [profileDraft.goal, ...GOALS]).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </EditField>
              <EditField label="Native language">
                <input
                  value={profileDraft.native}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, native: e.target.value }))}
                  className="w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                />
              </EditField>
              <EditField label="Target exam">
                <input
                  value={profileDraft.targetExam}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, targetExam: e.target.value }))}
                  placeholder="e.g. IELTS 7.5 (optional)"
                  className="w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                />
              </EditField>
              <EditField label="Hourly rate">
                <input
                  type="number"
                  value={profileDraft.hourlyRate}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, hourlyRate: e.target.value }))}
                  placeholder="e.g. 25 (optional)"
                  className="w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                />
              </EditField>
              <EditField label="Interests" hint="Separate with commas.">
                <input
                  value={profileDraft.interests}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, interests: e.target.value }))}
                  placeholder="travel, cooking, tech"
                  className="w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                />
              </EditField>
              <EditField label="Areas to improve" hint="Separate with commas.">
                <input
                  value={profileDraft.focus}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, focus: e.target.value }))}
                  placeholder="articles, pronunciation"
                  className="w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                />
              </EditField>
            </div>
          ) : (
            <>
              <dl className="mt-6 flex flex-col gap-3.5 text-sm">
                <Row k="Goal" v={profile.goal} />
                <Row k="Native language" v={profile.native} />
                {profile.targetExam && <Row k="Target exam" v={profile.targetExam} />}
                {profile.hourlyRate != null && (
                  <Row k="Hourly rate" v={`$${profile.hourlyRate.toFixed(2)}/hr`} />
                )}
                <Row k="Lessons taught" v={String(lessonsTaught)} />
                <Row k="Vocabulary bank" v={`${student.vocabCount} words`} />
                <Row k="Last lesson" v={student.lastSeen} />
              </dl>

              {profile.interests && profile.interests.length > 0 && (
                <div className="mt-6 border-t border-line pt-5">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">Interests</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.interests.map((t) => (
                      <span key={t} className="rounded-full border border-success/15 bg-success/8 px-3 py-1.5 text-sm font-medium text-success-deep">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 border-t border-line pt-5">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Areas to improve</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.focus.length > 0 ? (
                    profile.focus.map((f) => (
                      <span key={f} className="rounded-full border border-success/15 bg-success/8 px-3 py-1.5 text-sm font-medium text-success-deep">
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted">Set after the first lesson.</span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* tutor notes */}
          <div className="mt-6 border-t border-line pt-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Notes</div>
              {notesSaved && <span className="text-xs font-semibold text-mint">Saved ✓</span>}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={4}
              placeholder="Anything you want to remember about this student…"
              className="mt-3 w-full resize-y rounded-xl border border-brand-line bg-white px-3.5 py-3 text-sm text-ink outline-none transition-all focus:border-brand focus:ring-4 focus:ring-brand/30"
            />
          </div>

          {/* status */}
          <div className="mt-6 border-t border-line pt-5">
            <button
              onClick={toggleActive}
              className="w-full rounded-xl border border-line bg-white/70 px-4 py-2.5 text-sm font-semibold text-ink-soft transition-all duration-200 hover:-translate-y-0.5 hover:text-ink"
            >
              {active ? "Mark as inactive" : "Mark as active"}
            </button>
          </div>

          {/* delete */}
          <div className="mt-6 border-t border-line pt-5">
            {confirming ? (
              <div className="rounded-xl border border-[#f0c4c2] bg-[#fdf1f1] p-4">
                <p className="text-sm font-medium text-[#a23b38]">
                  Delete {profile.name}? This removes their profile and history from your roster.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-lg bg-[#d9534f] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[#c0524e] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#f0c4c2] hover:bg-[#fdf1f1] hover:text-[#a23b38]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                Delete student
              </button>
            )}
          </div>
        </section>

        {/* journey + sessions */}
        <div className="flex flex-col gap-6">
          <section
            className="relative overflow-hidden rounded-2xl p-6 text-white shadow-soft-sm"
            style={{ background: "linear-gradient(150deg,var(--panel),var(--panel-lift))" }}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-brand-lit">Suggested next</div>
            <h2 className="mt-2 font-display text-xl font-medium">Where to take {firstName} next</h2>
            <p className="mt-2 text-[var(--panel-text)]">
              {lessonsTaught === 0 ? (
                <>Record your first lesson with {firstName} and BumbleNote will start building their journey — vocabulary, areas to improve, and what to work on next.</>
              ) : recommendedFocus ? (
                <>Across {lessonsTaught} lesson{lessonsTaught === 1 ? "" : "s"}, the area costing {firstName} most is{" "}
                <span className="font-semibold text-white">{recommendedFocus}</span>
                {leadFocus && leadFocus.lessons > 1 ? (
                  <>, which has come up in {leadFocus.lessons} of them</>
                ) : null}
                . Worth clearing before moving deeper into {profile.goal.toLowerCase()} material.</>
              ) : (
                <>Based on {lessonsTaught} lesson{lessonsTaught === 1 ? "" : "s"}, BumbleNote recommends
                continuing to build {firstName}&rsquo;s confidence with {profile.goal.toLowerCase()} material.</>
              )}
            </p>

            {warmUp.length > 0 && (
              <div className="mt-4 rounded-xl border border-white/15 bg-white/10 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-brand-lit">
                  Warm-up exercise
                </div>
                <p className="mt-1.5 text-[var(--panel-text)]">
                  Recap last lesson: ask {firstName} to make a sentence with{" "}
                  {warmUp.map((v, i) => (
                    <span key={v.term} className="font-semibold text-white">
                      &ldquo;{v.term}&rdquo;
                      {i < warmUp.length - 1 ? (i === warmUp.length - 2 ? " and " : ", ") : ""}
                    </span>
                  ))}
                  .
                </p>
              </div>
            )}
          </section>

          {lessonsTaught > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-medium text-ink">The journey so far</h2>
                <TrajectoryChip trajectory={journey.trajectory} />
              </div>

              <dl className="grid grid-cols-3 gap-3">
                <Stat k="Lessons" v={String(lessonsTaught)} />
                <Stat k="Words taught" v={String(journey.vocabCount)} />
                <Stat
                  k="Level"
                  v={
                    !isLevelDetermined(lessonsTaught)
                      ? `Determining · ${lessonsTaught}/${LEVEL_DETERMINATION_LESSONS}`
                      : journey.levelFirst && journey.levelLatest && journey.levelFirst !== journey.levelLatest
                        ? `${journey.levelFirst} → ${journey.levelLatest}`
                        : (journey.levelLatest ?? "—")
                  }
                />
              </dl>

              {journey.activeFocus.length > 0 && (
                <div className="mt-6">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">
                    Still working on
                  </div>
                  <ul className="mt-3 flex flex-col gap-2">
                    {journey.activeFocus.map((f) => (
                      <FocusRow key={f.label} focus={f} />
                    ))}
                  </ul>
                </div>
              )}

              {journey.resolvedFocus.length > 0 && (
                <div className="mt-6">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">
                    Stopped coming up
                  </div>
                  {/* Not proof of mastery — only that it hasn't appeared lately —
                      so the copy stays careful about what it claims. */}
                  <p className="mt-1 text-xs text-muted">
                    Last flagged a few lessons ago, and not since.
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {journey.resolvedFocus.slice(0, 4).map((f) => (
                      <li
                        key={f.label}
                        className="flex items-center gap-2.5 rounded-xl border border-line bg-white/60 px-3.5 py-2.5 text-sm text-ink-soft"
                      >
                        <span className="flex-none text-success-deep" aria-hidden>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recurringVocab.length > 0 && (
                <div className="mt-6">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">
                    Words that keep coming back
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recurringVocab.map((v) => (
                      <span
                        key={v.term}
                        title={v.meaning}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-deep"
                      >
                        {v.term}
                        <span className="font-normal text-brand-deep/70">×{v.lessons}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-medium text-ink">Lesson history</h2>
            </div>
            <div className="flex flex-col gap-3">
              {sortedHistory.map((s) => {
                const { label, topic } = splitLessonTitle(s.title);
                const meta = [label, `${s.durationMin} min`, `${s.vocab.length} new words`]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={s.id}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-white/60 p-4 transition-all duration-200 hover:border-brand-line hover:shadow-soft-sm"
                  >
                    {editingId === s.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveTitle(s.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/30"
                        />
                        <button
                          onClick={() => saveTitle(s.id)}
                          className="flex-none rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-ink transition-transform hover:-translate-y-0.5"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-none rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-soft transition-colors hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link href={`/dashboard/sessions/${s.id}`} className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-ink">{s.date} · {topic}</div>
                          <div className="text-xs text-muted">{meta}</div>
                        </Link>
                        <button
                          onClick={() => { setEditingId(s.id); setEditTitle(topic); }}
                          className="flex-none rounded-lg border border-transparent p-2 text-muted opacity-0 transition-all duration-200 hover:border-brand-line hover:text-brand-deep group-hover:opacity-100"
                          aria-label="Rename lesson"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <StatusBadge status={s.status} />
                        <Link href={`/dashboard/sessions/${s.id}`} aria-label="Open lesson" className="flex-none">
                          <ChevronRightIcon className="text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand-deep" />
                        </Link>
                      </>
                    )}
                  </div>
                );
              })}
              {history.length === 0 && <p className="text-sm text-muted">No lessons recorded yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** One labeled control in the profile edit form. */
function EditField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="text-right font-semibold text-ink">{v}</dd>
    </div>
  );
}

/** One headline number in the journey panel. */
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/60 px-3.5 py-3">
      <dt className="text-xs font-medium text-muted">{k}</dt>
      <dd className="mt-1 font-display text-lg font-medium text-ink">{v}</dd>
    </div>
  );
}

/**
 * How the level trend reads to the tutor. `early` is shown rather than hidden:
 * "not enough lessons yet" is a more useful answer than an empty space, and it
 * explains why no trend is claimed.
 */
const TRAJECTORY_COPY: Record<Trajectory, { label: string; className: string }> = {
  rising: { label: "Progressing", className: "bg-success/12 text-success-deep" },
  holding: { label: "Holding steady", className: "bg-brand-soft text-brand-deep" },
  dipping: { label: "Slipping", className: "bg-[#fdf1f1] text-[#a23b38]" },
  early: { label: "Early days", className: "bg-line text-ink-soft" },
};

function TrajectoryChip({ trajectory }: { trajectory: Trajectory }) {
  const { label, className } = TRAJECTORY_COPY[trajectory];
  return (
    <span className={`rounded-full px-3 py-1 text-[.82rem] font-semibold ${className}`}>
      {label}
    </span>
  );
}

/**
 * An open area to improve. The lesson count is the whole point of the journey —
 * it turns "articles" from a note into "this has come up six times".
 */
function FocusRow({ focus }: { focus: JourneyFocus }) {
  const recurring = focus.lessons > 1;
  return (
    <li
      className="flex items-center gap-3 rounded-xl border border-line bg-white/60 px-3.5 py-2.5 transition-colors duration-200 hover:border-brand-line"
      // The variant phrasings are what got folded together; surfacing them on
      // hover is how a tutor checks the grouping is sane rather than trusting it.
      title={focus.phrasings.length > 1 ? focus.phrasings.join("\n") : undefined}
    >
      <span className="min-w-0 flex-1 text-sm text-ink">{focus.label}</span>
      <span
        className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${
          recurring ? "bg-brand-soft text-brand-deep" : "bg-line text-ink-soft"
        }`}
      >
        {recurring ? `${focus.lessons} lessons` : "new"}
      </span>
    </li>
  );
}
