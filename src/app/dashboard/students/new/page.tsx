"use client";

import { useState } from "react";
import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import Field from "@/components/auth/Field";
import { createStudent } from "@/app/actions/students";
import { GOALS, LEVELS } from "@/lib/student-options";

export default function NewStudentPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [native, setNative] = useState("");
  const [level, setLevel] = useState(LEVELS[0]);
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
        <div className="px-6 py-12 lg:px-10">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/12 text-success-deep">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mt-5 font-display text-2xl text-ink uppercase tracking-[.03em]">
              {created.name} is ready to go
            </h2>
            <p className="mt-2 text-ink-soft">
              Their profile is set up. Record your first lesson and BumbleNote will start
              building their journey.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Link
                href={`/dashboard/students/${created.id}`}
                className="inline-flex items-center gap-2 rounded-full bg-cocoa px-6 py-3 font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]"
                style={{ boxShadow: "0 10px 24px -10px rgba(65,46,40,.45)" }}
              >
                View {created.name.split(" ")[0]}&apos;s profile →
              </Link>
              <Link
                href="/dashboard/students"
                className="text-base font-semibold text-brand-deep hover:underline"
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
        <form onSubmit={handleSubmit} className="max-w-4xl">
          <Link href="/dashboard/students" className="text-sm font-medium text-brand-deep hover:underline">
            ← All students
          </Link>

          <div className="divide-y divide-line">
            <Section title="The basics" description="Who they are and where reports go.">
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
              <Field
                label="Native language"
                name="native"
                value={native}
                onChange={setNative}
                placeholder="e.g. Portuguese (optional)"
                hint="Helps anticipate common errors."
              />
            </Section>

            <Section
              title="Level & goals"
              description="A starting guess — BumbleNote confirms the real level after 4 taught lessons."
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Select label="Current level (CEFR)" value={level} onChange={setLevel} options={LEVELS} />
                <Select label="Primary goal" value={goal} onChange={setGoal} options={GOALS} />
              </div>
              <Field
                label="Target exam"
                name="targetExam"
                value={targetExam}
                onChange={setTargetExam}
                placeholder="e.g. IELTS 7.5 (optional)"
              />
            </Section>

            <Section title="Teaching notes" description="Shapes the examples and focus in every report.">
              <Field
                label="Interests & topics"
                name="interests"
                value={interests}
                onChange={setInterests}
                placeholder="e.g. travel, cooking, tech (optional)"
                hint="Separate with commas — makes examples engaging."
              />
              <Field
                label="Areas to improve"
                name="focus"
                value={focus}
                onChange={setFocus}
                placeholder="e.g. articles, pronunciation (optional)"
                hint="Separate with commas — your starting notes on weaknesses."
              />
              <Textarea
                label="Additional notes"
                value={notes}
                onChange={setNotes}
                placeholder="Optional. Anything from past lessons or another tutor — history, preferences, things to remember…"
                hint="Private to you. Shown on the student's profile."
              />
            </Section>

            <Section title="Rate" description="Private to you.">
              <div className="sm:max-w-[16rem]">
                <Field
                  label="Hourly rate"
                  type="number"
                  name="hourlyRate"
                  value={hourlyRate}
                  onChange={setHourlyRate}
                  placeholder="e.g. 25 (optional)"
                  hint="What you charge per hour."
                />
              </div>
            </Section>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 border-t border-line pt-6">
            {submitError && (
              <span className="mr-auto text-sm font-medium text-[#d9534f]">{submitError}</span>
            )}
            <Link
              href="/dashboard/students"
              className="text-base font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-cocoa px-6 py-3 font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]"
              style={{ boxShadow: "0 10px 24px -10px rgba(65,46,40,.45)" }}
            >
              {saving ? "Adding…" : "Add student"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

/**
 * One group of fields, laid out like the settings page: the heading in a narrow
 * left column on wide screens, the fields to its right, hairlines between.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 py-8 md:grid-cols-[13rem_1fr] md:gap-10">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
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
    </label>
  );
}
