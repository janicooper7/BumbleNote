"use client";

import { useState } from "react";
import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import Field from "@/components/auth/Field";
import Avatar from "@/components/dashboard/Avatar";
import { createStudent } from "@/app/actions/students";
import { GOALS, LEVELS } from "@/lib/student-options";

export default function NewStudentPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [native, setNative] = useState("");
  const [level, setLevel] = useState("A2");
  const [goal, setGoal] = useState(GOALS[0]);
  const [targetExam, setTargetExam] = useState("");
  const [interests, setInterests] = useState("");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  function splitList(v: string) {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setNameError("Please enter the student's name.");
      return;
    }
    setNameError(undefined);
    setSubmitError(undefined);
    setSaving(true);
    try {
      const rate = parseFloat(hourlyRate);
      const result = await createStudent({
        name,
        native: native.trim() || "—",
        email,
        level,
        goal,
        targetExam,
        interests: splitList(interests),
        focus: splitList(focus),
        notes,
        hourlyRate: Number.isFinite(rate) ? rate : undefined,
      });
      if (!result.ok) {
        // Expected refusal (e.g. the plan's student cap) — show what it said
        // rather than the generic retry copy, which wouldn't be true.
        setSubmitError(result.error);
        return;
      }
      setCreated({ id: result.id, name: name.trim() });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Couldn't save the student. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <>
        <Topbar title="Student added" subtitle="They're on your roster" />
        <div className="px-6 py-10 lg:px-10">
          <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-8 text-center shadow-soft-sm">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/15 text-2xl text-mint">✓</div>
            <h2 className="mt-5 font-display text-2xl font-medium text-ink">
              {created.name} is ready to go
            </h2>
            <p className="mt-2 text-ink-soft">
              Their profile is set up. Record your first lesson and BumbleNote will start
              building their journey.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={`/dashboard/students/${created.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5"
                style={{ boxShadow: "0 10px 24px -10px rgba(210,140,0,.6)" }}
              >
                View {created.name.split(" ")[0]}&apos;s profile →
              </Link>
              <Link
                href="/dashboard/students"
                className="rounded-xl border border-brand-line bg-white/60 px-6 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand"
              >
                Back to students
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Add a student" subtitle="Set up a profile so feedback is sharp from lesson one" />

      <div className="px-6 py-8 lg:px-10">
        <Link href="/dashboard/students" className="text-sm font-medium text-brand-deep hover:underline">
          ← All students
        </Link>

        <form
          onSubmit={handleSubmit}
          className="mt-4 max-w-2xl rounded-2xl border border-line bg-surface p-8 shadow-soft-sm"
        >
          {/* live preview */}
          <div className="mb-8 flex items-center gap-4 rounded-xl border border-line bg-brand-soft/40 p-4">
            <Avatar initial={name.trim() ? name.trim()[0].toUpperCase() : undefined} size={48} />
            <div>
              <div className="font-semibold text-ink">{name.trim() || "New student"}</div>
              <div className="text-sm text-muted">
                {level} · {goal}
                {native.trim() ? ` · ${native.trim()}` : ""}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <Field
              label="Full name"
              name="name"
              value={name}
              onChange={setName}
              placeholder="e.g. Maria Silva"
              error={nameError}
            />

            <Field
              label="Email"
              type="email"
              name="email"
              value={email}
              onChange={setEmail}
              placeholder="e.g. maria@email.com"
              autoComplete="off"
              hint="Where lesson-report PDFs are sent. You can add this later."
            />

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Native language"
                name="native"
                value={native}
                onChange={setNative}
                placeholder="e.g. Portuguese (optional)"
                hint="Helps anticipate common errors."
              />
              <Select
                label="Current level"
                value={level}
                onChange={setLevel}
                options={LEVELS}
                hint="CEFR A1–C2 — a starting guess. BumbleNote confirms the real level after 4 taught lessons."
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Select label="Primary goal" value={goal} onChange={setGoal} options={GOALS} />
              <Field
                label="Target exam"
                name="targetExam"
                value={targetExam}
                onChange={setTargetExam}
                placeholder="e.g. IELTS 7.5 (optional)"
              />
            </div>

            <Field
              label="Hourly rate"
              type="number"
              name="hourlyRate"
              value={hourlyRate}
              onChange={setHourlyRate}
              placeholder="e.g. 25 (optional)"
              hint="What you charge per hour for this student."
            />

            <Field
              label="Interests & topics"
              name="interests"
              value={interests}
              onChange={setInterests}
              placeholder="travel, cooking, tech"
              hint="Separate with commas — makes examples engaging."
            />

            <Field
              label="Areas to improve"
              name="focus"
              value={focus}
              onChange={setFocus}
              placeholder="articles, pronunciation"
              hint="Separate with commas — your starting notes on weaknesses."
            />

            <Textarea
              label="Additional notes"
              value={notes}
              onChange={setNotes}
              placeholder="Anything from past lessons or another tutor — history, preferences, things to remember…"
              hint="Private to you. Shown on the student's profile."
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-6">
            {submitError && (
              <span className="mr-auto text-sm font-medium text-[#d9534f]">{submitError}</span>
            )}
            <Link
              href="/dashboard/students"
              className="rounded-xl border border-brand-line bg-white/60 px-5 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ boxShadow: "0 10px 24px -10px rgba(210,140,0,.6)" }}
            >
              {saving ? "Adding…" : "Add student"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full resize-y rounded-xl border border-brand-line bg-white px-4 py-3 text-ink outline-none transition-all duration-200 placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/30"
      />
      {hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-brand-line bg-white px-4 py-3 text-ink outline-none transition-all duration-200 focus:border-brand focus:ring-4 focus:ring-brand/30"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>}
    </label>
  );
}
