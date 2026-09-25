import Reveal from "../Reveal";
import { Display, Eyebrow, LoopArrow, Script } from "../bn/Bn";

// One lesson, followed all the way through: the raw exchange, what BumbleNote
// pulls out of it, and the two things a tutor ends up with. It's a single
// example on purpose — this used to be two sections with two different lessons,
// on top of the same negotiation demo the hero and "How it works" already show.
// The student here (Tomás) is deliberately not the hero's Maria.
//
// Drawn as template 28: cocoa field, white / butter / blue note cards set at a
// slight tilt (straightened on hover), each tagged with a small pill.

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

// The tilt only applies from md up; on a phone the cards stack full-width and a
// rotation would just clip their corners.
const TILT = "transition-transform duration-500 md:hover:rotate-0";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[.72rem] font-semibold uppercase tracking-[.18em] text-ink-soft">
      {children}
    </div>
  );
}

function Tag({ tone, children }: { tone: "sky" | "cocoa" | "butter"; children: React.ReactNode }) {
  const look = {
    sky: "bg-sky text-cocoa",
    cocoa: "bg-cocoa text-butter",
    butter: "bg-butter text-cocoa",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-[.72rem] font-semibold uppercase tracking-[.16em] ${look}`}>
      {children}
    </span>
  );
}

export default function FeedbackSplit() {
  return (
    <section id="feedback" className="overflow-hidden bg-cocoa py-24 text-butter">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal className="mx-auto mb-16 max-w-3xl text-center">
          <Eyebrow className="text-sky">From lesson to recap</Eyebrow>
          <Display className="mt-5 text-[clamp(2.3rem,5vw,3.8rem)]">
            It reads <Script className="text-sky-deep">every</Script> line,
            <br /> so you don&apos;t have to
          </Display>
          <p className="mx-auto mt-6 max-w-[56ch] text-lg text-butter/85">
            BumbleNote keeps your voice and your student&apos;s cleanly apart, then works
            through the whole conversation — catching the small, recurring mistakes that
            slip past while you&apos;re busy teaching.
          </p>
        </Reveal>

        {/* ---- the lesson, and what was pulled out of it ---- */}
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
          <Reveal delay={60}>
            <div className={`rounded-[22px] bg-white p-6 text-ink sm:p-7 md:-rotate-2 ${TILT}`}>
              <div className="mb-5 flex items-center justify-between gap-3">
                <Tag tone="sky">Lesson excerpt</Tag>
                <span className="inline-flex items-center gap-1.5 text-[.72rem] font-semibold uppercase tracking-[.14em] text-muted">
                  <span className="h-2 w-2 animate-pulse-dot rounded-full bg-cocoa" />
                  two voices
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {transcript.map((t, i) => (
                  <div
                    key={i}
                    className={t.who === "Tutor" ? "flex justify-start" : "flex justify-end"}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[.97rem] leading-snug ${
                        t.who === "Tutor" ? "rounded-tl-sm bg-butter" : "rounded-tr-sm bg-sky"
                      }`}
                    >
                      <span className="mb-0.5 block text-[.64rem] font-semibold uppercase tracking-[.16em] text-ink-soft">
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
            <div className="flex flex-col items-center gap-1 text-sky">
              <span className="bn-marker font-script text-3xl text-sky-deep">reads it</span>
              <LoopArrow className="h-12 w-20" />
            </div>
          </Reveal>

          <Reveal delay={220}>
            <div className={`rounded-[22px] bg-butter p-6 text-ink sm:p-7 md:rotate-2 ${TILT}`}>
              <div className="mb-5">
                <Tag tone="cocoa">What BumbleNote pulled out</Tag>
              </div>
              <ul className="flex flex-col gap-4">
                {insights.map((it, i) => (
                  <Reveal as="li" key={i} delay={300 + i * 90}>
                    <div className="flex items-start gap-3">
                      <InsightIcon kind={it.kind} />
                      <div>
                        <div className="font-semibold uppercase tracking-[.08em] text-ink">{it.label}</div>
                        <div className="text-[.95rem] text-ink-soft">{it.note}</div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        {/* ---- the two outputs ---- */}
        <Reveal className="mx-auto mb-14 mt-28 max-w-2xl text-center">
          <Eyebrow className="text-sky">One for the student · one just for you</Eyebrow>
          <Display as="h3" className="mt-5 text-[clamp(2.1rem,4.4vw,3.3rem)]">
            Two outputs
            <Script block className="text-sky-deep">
              from one
            </Script>
            lesson
          </Display>
          <p className="mt-6 text-lg text-butter/85">
            Every lesson turns into a warm recap your student keeps — and a private set
            of notes only you see.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 items-stretch gap-8 md:grid-cols-2 md:gap-10">
          {/* ---- STUDENT: emailed recap ---- */}
          <Reveal delay={80}>
            <article className={`flex h-full flex-col rounded-[26px] bg-butter p-6 text-ink sm:p-8 md:-rotate-1 ${TILT}`}>
              <div className="mb-6 flex items-center justify-between gap-3">
                <Tag tone="sky">Emailed to your student</Tag>
                <Tag tone="cocoa">PDF</Tag>
              </div>

              <h4 className="font-display text-3xl uppercase">
                Your lesson <Script>recap</Script>
              </h4>
              <p className="mt-2 text-ink-soft">
                Plain-English and encouraging — something they&apos;ll actually keep.
              </p>

              <div className="mt-6 border-t border-cocoa/15 pt-5">
                <Label>New words you used</Label>
                <div className="flex flex-wrap gap-2">
                  {["crowded", "to bargain", "fresh"].map((w) => (
                    <span key={w} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-ink">
                      {w}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <Label>Areas to improve</Label>
                <ul className="flex flex-col gap-1.5 text-[.98rem] text-ink">
                  <li className="flex gap-2.5">
                    <span className="text-ink-soft">→</span>
                    <span>
                      Past simple: &ldquo;I go / buy&rdquo; → &ldquo;I went / bought&rdquo;
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="text-ink-soft">→</span>
                    <span>
                      Modal verbs: &ldquo;must to wait&rdquo; → &ldquo;had to wait&rdquo;
                    </span>
                  </li>
                </ul>
              </div>

              <div className="mt-5">
                <Label>You did brilliantly at</Label>
                <span className="inline-block rounded-full bg-sky px-3.5 py-1.5 text-sm font-medium text-ink">
                  Telling a story unprompted
                </span>
              </div>

              <p className="mt-auto pt-7 font-script text-3xl text-ink">
                Keep it up — see you next lesson
              </p>
            </article>
          </Reveal>

          {/* ---- TUTOR: private ruled notebook ---- */}
          <Reveal delay={160}>
            <article className={`relative flex h-full flex-col overflow-hidden rounded-[26px] bg-sky text-ink md:rotate-1 ${TILT}`}>
              {/* margin line */}
              <div className="pointer-events-none absolute inset-y-0 left-9 w-px bg-cocoa/30 sm:left-14" />

              <div className="relative flex flex-1 flex-col p-6 pl-12 sm:p-8 sm:pl-[76px]">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <Tag tone="butter">Only you see these</Tag>
                  <Tag tone="cocoa">Private</Tag>
                </div>

                <h4 className="font-display text-3xl uppercase">
                  Tutor <Script>notes</Script>
                </h4>

                {/* The ruling lives on the list itself, and every row is a whole
                    number of 34px lines, so text sits on the rules by construction
                    rather than by coincidence of the padding above it. */}
                <div
                  className="mt-6 text-[.98rem] leading-[34px] text-ink"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 33px, rgba(65,46,40,.16) 33px, rgba(65,46,40,.16) 34px)",
                  }}
                >
                  <div className="rounded-full bg-cocoa px-4 font-medium text-butter">
                    → Next lesson: role-play haggling at a market
                  </div>
                  {notes.map((n) => (
                    <p key={n}>
                      <span className="text-ink-soft">—</span> {n}
                    </p>
                  ))}
                </div>

                <p className="mt-auto pt-6 text-[.74rem] font-medium uppercase tracking-[.16em] text-ink-soft">
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
    <mark className="rounded bg-amber/25 px-1 text-ink">
      {children}
    </mark>
  );
}

function InsightIcon({ kind }: { kind: "fix" | "word" | "win" }) {
  const map = {
    fix: { cls: "bg-cocoa text-butter", glyph: "!" },
    word: { cls: "bg-sky text-cocoa", glyph: "A" },
    win: { cls: "bg-white text-cocoa", glyph: "✓" },
  }[kind];
  return (
    <span
      aria-hidden
      className={`mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full text-[.75rem] font-bold ${map.cls}`}
    >
      {map.glyph}
    </span>
  );
}
