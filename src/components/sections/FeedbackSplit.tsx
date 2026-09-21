import Reveal from "../Reveal";

// One lesson, followed all the way through: the raw exchange, what BumbleNote
// pulls out of it, and the two things a tutor ends up with. It's a single
// example on purpose — this used to be two sections with two different lessons,
// on top of the same negotiation demo the hero and "How it works" already show.
// The student here (Tomás) is deliberately not the hero's Maria.

type Turn = { who: "Tutor" | "Student"; text: React.ReactNode };

const transcript: Turn[] = [
  { who: "Tutor", text: "So tell me about your weekend — what did you do?" },
  {
    who: "Student",
    text: (
      <>
        Yesterday I <Mark>go</Mark> to the market and <Mark>buy</Mark> some fish.
      </>
    ),
  },
  { who: "Tutor", text: "Nice! And how was it?" },
  {
    who: "Student",
    text: (
      <>
        Is very crowded. I <Mark>must to wait</Mark> long time.
      </>
    ),
  },
];

const insights = [
  {
    kind: "fix" as const,
    label: "Past simple",
    note: "“I go / buy” → “went / bought” — same slip as the last two lessons.",
  },
  {
    kind: "fix" as const,
    label: "Modal verb",
    note: "“I must to wait” → “I had to wait”.",
  },
  {
    kind: "word" as const,
    label: "crowded",
    note: "Used correctly and unprompted — worth banking.",
  },
  {
    kind: "win" as const,
    label: "Told a story in the past",
    note: "Reached for narrative past tense on their own. Encourage it.",
  },
];

const notes = [
  "Recurring: past simple slips (go / buy), same as the last two lessons",
  "Progress: telling stories unprompted, ready for longer narratives",
  "Watch: “must to + verb” — a modal habit worth a short drill",
  "Loves markets, food & travel topics — use for vocab",
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[.72rem] font-bold uppercase tracking-[.12em] text-muted">
      {children}
    </div>
  );
}

export default function FeedbackSplit() {
  return (
    <section id="feedback" className="py-24">
      <div className="mx-auto w-full max-w-[1160px] px-8">
        <Reveal className="mb-14 max-w-2xl">
          <div className="text-[.82rem] font-bold uppercase tracking-widest text-brand-deep">
            From lesson to recap
          </div>
          <h2 className="mt-4 font-display text-[clamp(2rem,3.8vw,2.9rem)] font-medium tracking-tight">
            It reads every line, so you don&apos;t have to.
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            BumbleNote keeps your voice and your student&apos;s cleanly apart, then works
            through the whole conversation — catching the small, recurring mistakes that
            slip past while you&apos;re busy teaching.
          </p>
        </Reveal>

        {/* ---- the lesson, and what was pulled out of it ---- */}
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-4">
          <Reveal delay={60}>
            <div className="rounded-[22px] border border-line bg-surface p-6 shadow-soft-sm sm:p-7">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-[.72rem] font-bold uppercase tracking-[.12em] text-muted">
                  Lesson excerpt · two voices
                </span>
                <span className="inline-flex items-center gap-1.5 text-[.72rem] font-semibold text-muted">
                  <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand" />
                  captured
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {transcript.map((t, i) => (
                  <div
                    key={i}
                    className={t.who === "Tutor" ? "flex justify-start" : "flex justify-end"}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[.95rem] leading-snug ${
                        t.who === "Tutor"
                          ? "rounded-tl-sm bg-brand-soft text-ink"
                          : "rounded-tr-sm bg-mint/10 text-ink"
                      }`}
                    >
                      <span
                        className={`mb-0.5 block text-[.66rem] font-bold uppercase tracking-wider ${
                          t.who === "Tutor" ? "text-brand-deep" : "text-[#137e70]"
                        }`}
                      >
                        {t.who}
                      </span>
                      {t.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={140} className="hidden lg:block">
            <div className="flex flex-col items-center gap-2 px-1 text-brand-deep">
              <span className="text-[.7rem] font-bold uppercase tracking-wider text-muted">
                reads it
              </span>
              <svg width="40" height="20" viewBox="0 0 40 20" fill="none" aria-hidden>
                <path
                  d="M2 10h34m0 0-7-6m7 6-7 6"
                  stroke="var(--color-brand-deep)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Reveal>

          <Reveal delay={220}>
            <div className="rounded-[22px] border border-brand-line bg-surface p-6 shadow-soft-md sm:p-7">
              <div className="mb-5 text-[.72rem] font-bold uppercase tracking-[.12em] text-muted">
                What BumbleNote pulled out
              </div>
              <ul className="flex flex-col gap-3.5">
                {insights.map((it, i) => (
                  <Reveal as="li" key={i} delay={300 + i * 90}>
                    <div className="flex items-start gap-3">
                      <InsightIcon kind={it.kind} />
                      <div>
                        <div className="font-semibold text-ink">{it.label}</div>
                        <div className="text-[.9rem] text-ink-soft">{it.note}</div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        {/* ---- the two outputs ---- */}
        <Reveal className="mx-auto mb-12 mt-24 max-w-2xl text-center">
          <div className="text-[.82rem] font-bold uppercase tracking-widest text-brand-deep">
            Two outputs, one lesson
          </div>
          <h3 className="mt-4 font-display text-[clamp(1.7rem,3.2vw,2.4rem)] font-medium tracking-tight">
            One for the student. <br className="hidden sm:block" />
            One just for you.
          </h3>
          <p className="mt-4 text-lg text-ink-soft">
            Every lesson turns into a warm recap your student keeps — and a private set
            of notes only you see.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* ---- STUDENT: emailed recap ---- */}
          <Reveal delay={80}>
            <article className="flex h-full flex-col overflow-hidden rounded-[22px] border border-line bg-white shadow-soft-md">
              <div
                className="h-1.5 w-full"
                style={{
                  background: "linear-gradient(90deg,var(--color-brand),var(--color-brand-deep))",
                }}
              />
              <div className="flex flex-1 flex-col p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-sm text-ink-soft">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand-deep">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m3 7 9 6 9-6" />
                      </svg>
                    </span>
                    Emailed to your student
                  </div>
                  <span className="rounded-md border border-brand-line bg-brand-soft px-2 py-1 text-[.7rem] font-bold text-brand-deep">
                    PDF
                  </span>
                </div>

                <h4 className="font-display text-2xl font-medium text-ink">Your lesson recap</h4>
                <p className="mt-1.5 text-ink-soft">
                  Plain-English and encouraging — something they&apos;ll actually keep.
                </p>

                <div className="mt-6 border-t border-line pt-5">
                  <Label>New words you used</Label>
                  <div className="flex flex-wrap gap-2">
                    {["crowded", "to bargain", "fresh"].map((w) => (
                      <span
                        key={w}
                        className="rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand-deep"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <Label>Areas to improve</Label>
                  <ul className="flex flex-col gap-1.5 text-[.97rem] text-ink">
                    <li className="flex gap-2.5">
                      <span className="text-brand-deep">→</span>
                      <span>
                        Past simple: &ldquo;I go / buy&rdquo; → &ldquo;I went / bought&rdquo;
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="text-brand-deep">→</span>
                      <span>
                        Modal verbs: &ldquo;must to wait&rdquo; → &ldquo;had to wait&rdquo;
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5">
                  <Label>You did brilliantly at</Label>
                  <span className="inline-block rounded-full border border-mint/25 bg-mint/12 px-3 py-1.5 text-sm font-medium text-[#137e70]">
                    Telling a story unprompted
                  </span>
                </div>

                <p className="mt-auto pt-6 font-display text-lg italic text-ink-soft">
                  Keep it up — see you next lesson 👋
                </p>
              </div>
            </article>
          </Reveal>

          {/* ---- TUTOR: private ruled notebook ---- */}
          <Reveal delay={160}>
            <article className="relative flex h-full flex-col overflow-hidden rounded-[22px] border border-line bg-white shadow-soft-md">
              {/* margin line */}
              <div className="pointer-events-none absolute inset-y-0 left-9 w-px bg-amber/45 sm:left-14" />
              {/* private tab */}
              <div className="absolute right-5 top-5 rounded-md bg-ink px-2.5 py-1 text-[.66rem] font-bold uppercase tracking-wider text-white/90 sm:right-6 sm:top-6">
                Private
              </div>

              <div className="relative flex flex-1 flex-col p-6 pl-12 sm:p-8 sm:pl-[76px]">
                <div className="mb-6 flex items-center gap-2.5 text-sm text-ink-soft">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint/15 text-[#137e70]">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </span>
                  Only you see these
                </div>

                <h4 className="font-display text-2xl font-medium text-ink">Tutor notes</h4>

                {/* The ruling lives on the list itself, and every row is a whole
                    number of 34px lines, so text sits on the rules by construction
                    rather than by coincidence of the padding above it. */}
                <div
                  className="mt-6 text-[.97rem] leading-[34px] text-ink"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 33px, var(--color-line) 33px, var(--color-line) 34px)",
                  }}
                >
                  <div className="rounded-lg bg-brand-soft px-3 font-medium text-brand-deep">
                    → Next lesson: role-play haggling at a market
                  </div>
                  {notes.map((n) => (
                    <p key={n}>
                      <span className="text-muted">—</span> {n}
                    </p>
                  ))}
                </div>

                <p className="mt-auto pt-6 text-sm text-muted">
                  Saved to Tomás&apos;s journey · builds on 6 past lessons
                </p>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <mark className="rounded bg-amber/20 px-1 text-ink decoration-amber/60 underline-offset-2">
      {children}
    </mark>
  );
}

function InsightIcon({ kind }: { kind: "fix" | "word" | "win" }) {
  const map = {
    fix: { bg: "bg-amber/15", fg: "text-amber", glyph: "!" },
    word: { bg: "bg-brand-soft", fg: "text-brand-deep", glyph: "A" },
    win: { bg: "bg-mint/12", fg: "text-[#137e70]", glyph: "✓" },
  }[kind];
  return (
    <span
      aria-hidden
      className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-[8px] text-[.72rem] font-bold ${map.bg} ${map.fg}`}
    >
      {map.glyph}
    </span>
  );
}
