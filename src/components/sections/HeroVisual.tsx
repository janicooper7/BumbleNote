"use client";

import { useEffect, useRef, useState } from "react";

// The lesson card is one continuous loop: it listens, writes the recap, shows it
// ready, then replays. The one flourish is the voice timeline in the header —
// tutor and student on a single strip, each in their own colour — because
// telling the two voices apart is the thing BumbleNote does that a plain
// recorder doesn't. Everything else stays quiet on purpose.

const TUTOR = "#ffd143";
const STUDENT = "#7ff0dc";

// Who is speaking, in bars: alternating turns, a little uneven like real talk.
const TURNS: ["you" | "student", number][] = [
  ["you", 9],
  ["student", 13],
  ["you", 6],
  ["student", 16],
  ["you", 8],
  ["student", 10],
  ["you", 5],
  ["student", 7],
];

// Deterministic on purpose (no Math.random): the server and the client must
// render identical bars. Heights are rounded so tiny float differences between
// engines can't cause a hydration mismatch.
const TIMELINE = TURNS.flatMap(([who, n]) => Array.from({ length: n }, () => who)).map(
  (who, i) => ({
    who,
    h: Math.round(24 + 66 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.53))),
  }),
);

const VOCAB = ["to negotiate", "deadline", "on second thought"];
const RULE = "Articles before abstract nouns";

const PHASE = { LISTEN: 0, WRITE: 1, READY: 2 } as const;
const DUR = [4200, 5600, 3800]; // ms per phase

export default function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useRef(true); // pointer tilt active?
  const frame = useRef(0);

  const [rawPhase, setPhase] = useState<number>(PHASE.READY);
  const [cycle, setCycle] = useState(0); // remounts the animated content each loop
  const [sec, setSec] = useState(38);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);

  // preferences: reduced motion disables the loop; coarse pointers disable tilt
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(hover: none), (pointer: coarse)");
    const sync = () => {
      setReduced(motion.matches);
      enabled.current = !motion.matches && !coarse.matches;
    };
    sync();
    motion.addEventListener("change", sync);
    coarse.addEventListener("change", sync);
    return () => {
      motion.removeEventListener("change", sync);
      coarse.removeEventListener("change", sync);
    };
  }, []);

  // only run while the card is on screen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // phase clock. Off-screen, or with reduced motion on, the card freezes on the
  // finished recap — derived here during render rather than pushed through
  // setPhase from inside the effect, which would cascade an extra render every
  // time the card scrolls in or out of view.
  const frozen = reduced || !inView;
  const phase = frozen ? PHASE.READY : rawPhase;

  useEffect(() => {
    if (frozen) return;
    const id = setTimeout(() => {
      setPhase((p) => {
        const next = (p + 1) % 3;
        if (next === PHASE.LISTEN) setCycle((c) => c + 1);
        return next;
      });
    }, DUR[phase]);
    return () => clearTimeout(id);
  }, [phase, frozen]);

  // elapsed-lesson ticker (only meaningful while listening)
  useEffect(() => {
    if (reduced || !inView) return;
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const mmss = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const listening = phase === PHASE.LISTEN;
  const writing = phase === PHASE.WRITE;
  const ready = phase === PHASE.READY;

  // pointer tilt
  const setVars = (px: number, py: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--px", px.toFixed(3));
    el.style.setProperty("--py", py.toFixed(3));
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled.current) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setVars(px, py));
  };
  const onLeave = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setVars(0, 0));
  };

  return (
    <div className="ct-rise relative" style={{ animationDelay: "160ms" }}>
      {/* ambient aurora — drifting behind the card */}
      <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10">
        <div className="ct-aurora absolute right-2 top-0 h-56 w-56 rounded-full bg-brand/25 blur-3xl" />
        <div
          className="ct-aurora absolute -left-4 bottom-4 h-52 w-52 rounded-full bg-mint/20 blur-3xl"
          style={{ animationDelay: "-6s", animationDuration: "18s" }}
        />
      </div>

      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="relative [perspective:1150px]"
        style={{ ["--px" as string]: 0, ["--py" as string]: 0 }}
      >
        <div
          className="relative [transform-style:preserve-3d]"
          style={{
            // A gentle parallax under the pointer, and nothing else: the card no
            // longer bobs on its own, which read as a 2019 landing-page habit.
            transform: "rotateX(calc(var(--py) * -4deg)) rotateY(calc(var(--px) * 5deg))",
            transition: "transform .4s var(--ease-smooth)",
          }}
        >
          {/* earlier lessons, stacked behind — the running history */}
          <div
            aria-hidden
            className="absolute inset-x-6 -top-2.5 h-40 rounded-[24px] border border-line bg-white/50"
            style={{ transform: "translateZ(-40px)" }}
          />
          <div
            aria-hidden
            className="absolute inset-x-3 -top-1 h-40 rounded-[24px] border border-line bg-white/80"
            style={{ transform: "translateZ(-20px)" }}
          />

          {/* main lesson card */}
          <div className="relative z-10" style={{ transform: "translateZ(20px)" }}>
            <div
              className="overflow-hidden rounded-[24px] border border-black/[.06] bg-white"
              style={{
                boxShadow:
                  "0 1px 0 rgba(255,255,255,.9) inset, 0 32px 64px -32px rgba(22,35,61,.35), 0 12px 24px -16px rgba(22,35,61,.16)",
              }}
            >
              {/* ── capture header: the lesson, as sound ── */}
              <div
                className="relative overflow-hidden px-6 pb-5 pt-5 text-white"
                style={{ background: "linear-gradient(160deg,var(--panel) 0%,var(--panel-lift) 140%)" }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-brand/20 blur-3xl"
                />

                <div className="relative flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.07] px-2.5 py-1 text-[.72rem] font-medium ring-1 ring-white/10">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="6" width="12" height="12" rx="2.5" />
                      <path d="m15 10.5 6-3.5v10l-6-3.5" />
                    </svg>
                    Google Meet
                  </span>
                  <StatusBadge phase={phase} time={mmss} />
                </div>

                <div className="relative mt-4">
                  <div className="text-[1.15rem] font-semibold leading-tight tracking-tight">
                    Lesson 12
                  </div>
                  <div className="mt-0.5 text-[.8rem] text-[var(--panel-dim)]">
                    Business English · with Maria S.
                  </div>
                </div>

                <VoiceTimeline active={listening || writing} />

                <div className="relative mt-3 flex items-center gap-5 text-[.74rem] text-[var(--panel-dim)]">
                  <Legend tint={TUTOR} name="You" role="Tutor" />
                  <Legend tint={STUDENT} name="Maria S." role="Student" />
                </div>
              </div>

              {/* ── body: transcript captured → recap written ──
                  A grid rather than stacked/absolute layers: the live transcript,
                  the recap and an invisible copy of the finished recap all sit in
                  one cell, so the card is always as tall as the recap and never
                  jumps when the loop swaps between them. */}
              <div className="relative grid p-6">
                <div
                  className={`col-start-1 row-start-1 flex flex-col transition-all duration-500 ${
                    listening ? "opacity-100" : "-translate-y-2 opacity-0"
                  }`}
                  aria-hidden={!listening}
                >
                  {listening && <Transcript key={`t-${cycle}`} />}
                </div>

                <div
                  className={`col-start-1 row-start-1 transition-all duration-500 ${
                    listening ? "translate-y-2 opacity-0" : "opacity-100"
                  }`}
                  aria-hidden={listening}
                >
                  {!listening && <Recap key={`r-${cycle}`} instant={reduced || ready} />}
                </div>

                <div aria-hidden className="pointer-events-none invisible col-start-1 row-start-1">
                  <Recap instant />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[.85rem] text-ink-soft">
        Drafted as soon as you stop recording — you just review and send.
      </p>
    </div>
  );
}

/* ── the signature: both voices on one timeline, told apart by colour ── */
function VoiceTimeline({ active }: { active: boolean }) {
  return (
    <div
      role="img"
      aria-label="Waveform of the lesson, with the tutor's and the student's voices in separate colours"
      className="relative mt-5 flex h-12 items-center gap-[2px]"
    >
      {TIMELINE.map((b, i) => (
        <span
          key={i}
          className={`flex-1 rounded-full ${active ? "ct-eq" : ""}`}
          style={{
            height: `${b.h}%`,
            background: b.who === "you" ? TUTOR : STUDENT,
            opacity: 0.92,
            transformOrigin: "center",
            animationDelay: `${(i * 53) % 900}ms`,
          }}
        />
      ))}
    </div>
  );
}

function Legend({ tint, name, role }: { tint: string; name: string; role: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
      <span className="font-semibold text-white">{name}</span>
      {role}
    </span>
  );
}

/* ── header status: recording → writing → ready ── */
function StatusBadge({ phase, time }: { phase: number; time: string }) {
  const pill =
    "inline-flex items-center gap-1.5 rounded-full bg-white/[.07] px-2.5 py-1 text-[.72rem] font-semibold ring-1 ring-white/10";
  if (phase === PHASE.LISTEN) {
    return (
      <span className={`${pill} tabular-nums`}>
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#ff8080]" />
        REC {time}
      </span>
    );
  }
  if (phase === PHASE.WRITE) {
    return (
      <span className={pill}>
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white" />
        Writing recap…
      </span>
    );
  }
  return (
    <span className={pill}>
      <span className="h-1.5 w-1.5 rounded-full bg-[#7ff0dc] shadow-[0_0_0_3px_rgba(127,240,220,.22)]" />
      Draft ready
    </span>
  );
}

/* ── LISTEN layer: live transcript, the caught line underlined ── */
function Transcript() {
  const lines = [
    { who: "You", initial: "Y", me: true, text: <>So — how did the negotiation go?</> },
    {
      who: "Maria",
      initial: "M",
      me: false,
      text: (
        <>
          We{" "}
          <span className="font-medium underline decoration-amber decoration-2 underline-offset-4">
            postpone
          </span>{" "}
          the deadline until Friday.
        </>
      ),
    },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-2 text-[.78rem] font-medium text-ink-soft">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#e0605f]" />
        Live transcript
      </div>
      <div className="flex flex-col gap-4">
        {lines.map((l, i) => (
          <div key={i} className="ct-rise flex items-start gap-3" style={{ animationDelay: `${300 + i * 900}ms` }}>
            <span
              className="grid h-7 w-7 flex-none place-items-center rounded-full text-[.7rem] font-bold"
              style={{
                color: l.me ? "var(--color-brand-deep)" : "#137e70",
                background: l.me ? "var(--color-brand-soft)" : "rgba(43,182,164,.14)",
              }}
            >
              {l.initial}
            </span>
            <div>
              <div className="text-[.72rem] font-semibold text-muted">{l.who}</div>
              <div className="text-[.95rem] leading-relaxed text-ink">
                {l.text}
                {i === lines.length - 1 && (
                  <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] bg-ink ct-caret" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-4 text-[.78rem] text-muted">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-mint" />
        Telling your voice apart from Maria&apos;s…
      </div>
    </div>
  );
}

/* ── WRITE/READY layer: the recap composing itself ── */
function Recap({ instant }: { instant: boolean }) {
  return (
    <div className="flex flex-col">
      {/* level — a real level-up, made visual */}
      <div className="ct-rise mb-5" style={{ animationDelay: "60ms" }}>
        <div className="mb-2 flex items-center justify-between text-[.78rem] font-medium">
          <span className="text-ink-soft">Level progress</span>
          <span className="tabular-nums text-muted">
            B1 <span aria-hidden>→</span> <span className="font-semibold text-brand-deep">B2</span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-brand-soft">
          <div
            className={`relative h-full overflow-hidden rounded-full ${instant ? "" : "ct-grow"}`}
            style={{
              width: "72%",
              background: "linear-gradient(90deg,var(--color-brand-lit),var(--color-brand))",
            }}
          >
            {!instant && (
              <span className="ct-gloss absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            )}
          </div>
        </div>
      </div>

      <div className="ct-rise mb-2 text-[.78rem] font-medium text-ink-soft" style={{ animationDelay: "160ms" }}>
        New vocabulary
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {VOCAB.map((w, i) => (
          <span
            key={w}
            className={instant ? "" : "ct-pop"}
            style={instant ? undefined : { animationDelay: `${320 + i * 150}ms` }}
          >
            <Chip>{w}</Chip>
          </span>
        ))}
      </div>

      {/* what a tutor never catches mid-lesson — a diff, not a warning */}
      <div
        className={`mb-5 rounded-2xl border border-brand-line/70 bg-gradient-to-b from-brand-soft/70 to-white p-4 ${
          instant ? "" : "ct-rise"
        }`}
        style={instant ? undefined : { animationDelay: "760ms" }}
      >
        <div className="mb-2.5 flex items-center gap-2 text-[.78rem] font-semibold text-brand-deep">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-brand/20">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
            </svg>
          </span>
          Caught for you
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[.95rem]">
          <del className="rounded bg-danger/10 px-1.5 py-0.5 text-danger-deep decoration-danger/60">
            the advice
          </del>
          <span aria-hidden className="text-muted">
            →
          </span>
          <ins className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success-deep no-underline">
            advice
          </ins>
        </div>
        <p className="mt-1.5 min-h-[1.25rem] text-[.84rem] text-ink-soft">
          <Typewriter key={RULE} text={RULE} startDelay={1000} instant={instant} />
        </p>
      </div>

      <div className="ct-rise flex items-center justify-between gap-3 border-t border-line pt-4" style={{ animationDelay: "220ms" }}>
        <span className="inline-flex items-center gap-1.5 text-[.8rem] text-ink-soft">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
          Builds on 11 past lessons
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[.82rem] font-semibold text-ink"
          style={{ boxShadow: "0 8px 20px -8px rgba(210,140,0,.6)" }}
        >
          Send recap
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* types `text` one character at a time; renders it whole when `instant`.
   `n` is only ever advanced from inside the interval callback — the finished and
   restart-from-zero cases are derived during render instead, so the effect body
   never calls setState. Callers key this on `text` so a change starts over. */
function Typewriter({ text, startDelay, instant }: { text: string; startDelay: number; instant: boolean }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (instant) return;
    let i = 0;
    let tick: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      tick = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) clearInterval(tick);
      }, 24);
    }, startDelay);
    return () => {
      clearTimeout(start);
      clearInterval(tick);
    };
  }, [text, startDelay, instant]);

  const shown = instant ? text.length : n;
  const done = shown >= text.length;
  return (
    <>
      {text.slice(0, shown)}
      {!done && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] bg-ink ct-caret" />}
    </>
  );
}

// Not interactive, so it doesn't lift on hover — that would promise a click.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[.84rem] font-medium text-ink shadow-[0_1px_2px_rgba(22,35,61,.05)]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
      {children}
    </span>
  );
}
