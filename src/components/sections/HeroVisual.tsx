"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "../Reveal";

// bar heights (%) for each separated voice track — two distinct patterns
const WAVE_YOU = [42, 74, 54, 86, 60, 90, 48, 78, 44, 68, 58, 82, 50];
const WAVE_STUDENT = [36, 62, 48, 88, 54, 72, 40, 80, 58, 66, 46, 84, 52];

const VOCAB = ["to negotiate", "deadline", "on second thought"];
const CORRECTION = "“the advice” → advice — articles before abstract nouns";

// The lesson card runs one continuous loop: it listens, writes the recap,
// shows it ready, then replays. Phase durations (ms).
const PHASE = { LISTEN: 0, WRITE: 1, READY: 2 } as const;
const DUR = [4200, 5600, 3800];

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
    <Reveal delay={160} className="relative">
      {/* ambient aurora — the one saturated flourish, drifting behind the card */}
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
            transform:
              "rotateX(calc(var(--py) * -7deg)) rotateY(calc(var(--px) * 9deg))",
            transition: "transform .4s var(--ease-smooth)",
          }}
        >
          {/* stacked "past lessons" behind — hints at the running history */}
          <div
            aria-hidden
            className="absolute inset-x-5 -top-3 h-40 rounded-[26px] border border-line bg-white/55 shadow-soft-sm"
            style={{ transform: "translateZ(-40px)" }}
          />
          <div
            aria-hidden
            className="absolute inset-x-2.5 -top-1.5 h-40 rounded-[26px] border border-line bg-white/80 shadow-soft-sm"
            style={{ transform: "translateZ(-20px)" }}
          />

          {/* main lesson card */}
          <div className="relative z-10" style={{ transform: "translateZ(20px)" }}>
            <div className="animate-float overflow-hidden rounded-[26px] border border-line bg-white shadow-soft-lg">
              {/* ── capture header: the lesson, as sound ── */}
              <div
                className="relative overflow-hidden px-6 pb-5 pt-5 text-white"
                style={{ background: "linear-gradient(150deg,var(--panel) 0%,var(--panel-lift) 100%)" }}
              >
                <div className="relative flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#0b1728] px-3 py-1 text-[.72rem] font-semibold">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 11a1 1 0 0 1 2 0v2a1 1 0 0 1-2 0Zm5-4a1 1 0 0 1 2 0v10a1 1 0 0 1-2 0Zm5 3a1 1 0 0 1 2 0v4a1 1 0 0 1-2 0Zm5-5a1 1 0 0 1 2 0v14a1 1 0 0 1-2 0Z" />
                    </svg>
                    Google Meet
                  </span>
                  <StatusBadge phase={phase} time={mmss} />
                </div>

                <div className="relative mt-3 text-[.76rem] font-medium text-[var(--panel-dim)]">
                  Lesson 12 · Business English
                </div>

                {/* two voices, told apart — tutor and student each on their own track */}
                <div className="relative mt-3 grid grid-cols-2 gap-3">
                  <VoicePanel
                    label="You"
                    sub="Tutor"
                    tint="#ffd143"
                    bars={WAVE_YOU}
                    active={listening || writing}
                  />
                  <VoicePanel
                    label="Maria S."
                    sub="Student"
                    tint="#7ff0dc"
                    bars={WAVE_STUDENT}
                    active={listening || writing}
                    shift={140}
                  />
                </div>
              </div>

              {/* ── body: transcript captured → recap written ── */}
              <div className="relative min-h-[288px] p-6 sm:min-h-[300px]">
                {/* LISTEN: the raw lesson, arriving live */}
                <div
                  className={`absolute inset-6 transition-all duration-500 ${
                    listening ? "opacity-100" : "-translate-y-2 opacity-0"
                  }`}
                  aria-hidden={!listening}
                >
                  {listening && <Transcript key={`t-${cycle}`} />}
                </div>

                {/* WRITE + READY: the recap composing itself */}
                <div
                  className={`transition-all duration-500 ${
                    listening ? "translate-y-2 opacity-0" : "opacity-100"
                  }`}
                  aria-hidden={listening}
                >
                  {!listening && <Recap key={`r-${cycle}`} instant={reduced || ready} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Written the moment your lesson ended — you just review and send.
      </p>
    </Reveal>
  );
}

/* ── one separated voice track on the capture header ── */
function VoicePanel({
  label,
  sub,
  tint,
  bars,
  active,
  shift = 0,
}: {
  label: string;
  sub: string;
  tint: string;
  bars: number[];
  active: boolean;
  shift?: number;
}) {
  return (
    <div className="rounded-2xl bg-[#0b1728] p-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tint }} />
        <span className="truncate font-display text-[.92rem] font-semibold leading-none text-white">
          {label}
        </span>
        <span className="ml-auto text-[.6rem] font-semibold uppercase tracking-wider text-[var(--panel-dim)]">
          {sub}
        </span>
      </div>
      <div className="mt-3 flex h-7 items-end gap-[3px]">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`w-full rounded-full ${active ? "ct-eq" : ""}`}
            style={{
              height: `${h}%`,
              background: tint,
              animationDelay: `${(i * 70 + shift) % 900}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── header status: recording → writing → ready ── */
function StatusBadge({ phase, time }: { phase: number; time: string }) {
  if (phase === PHASE.LISTEN) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b1728] px-2.5 py-1 text-[.72rem] font-bold tabular-nums">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#ff8080]" />
        REC {time}
      </span>
    );
  }
  if (phase === PHASE.WRITE) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b1728] px-2.5 py-1 text-[.72rem] font-bold">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white" />
        Writing recap…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b1728] px-2.5 py-1 text-[.72rem] font-bold">
      <span className="h-1.5 w-1.5 rounded-full bg-[#7ff0dc]" />
      Draft ready
    </span>
  );
}

/* ── LISTEN layer: live transcript, the caught line highlighted ── */
function Transcript() {
  const lines = [
    { who: "You", text: "So — how did the negotiation go?", me: true },
    { who: "Maria", text: "We postpone the deadline until Friday.", me: false, flag: true },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2 text-[.68rem] font-bold uppercase tracking-widest text-muted">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand" />
        Live transcript
      </div>
      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <div key={i} className="ct-rise flex gap-2.5" style={{ animationDelay: `${300 + i * 900}ms` }}>
            <span
              className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[.68rem] font-bold"
              style={{
                color: l.me ? "var(--color-brand-deep)" : "#137e70",
                background: l.me ? "var(--color-brand-soft)" : "rgba(43,182,164,.14)",
              }}
            >
              {l.who}
            </span>
            <span className="text-[.95rem] leading-relaxed text-ink">
              {l.flag ? (
                <>
                  We <span className="rounded bg-amber/20 px-1 font-medium text-brand-deep">postpone</span> the
                  deadline until Friday.
                </>
              ) : (
                l.text
              )}
              {i === lines.length - 1 && (
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] bg-ink ct-caret" />
              )}
            </span>
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
      {/* CEFR jump — a real level-up, made visual */}
      <div className="ct-rise mb-5 flex items-center gap-3" style={{ animationDelay: "60ms" }}>
        <span className="font-display text-sm font-semibold text-ink-soft">B1</span>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-brand-soft">
          <div
            className={`absolute inset-y-0 left-0 overflow-hidden rounded-full ${instant ? "" : "ct-grow"}`}
            style={{
              width: "72%",
              background: "linear-gradient(90deg,var(--color-brand),var(--color-brand-deep))",
            }}
          >
            {!instant && (
              <span className="ct-gloss absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            )}
          </div>
        </div>
        <span className="font-display text-sm font-semibold text-brand-deep">B2</span>
      </div>

      <div className="ct-rise mb-2 text-[.72rem] font-bold uppercase tracking-wider text-muted" style={{ animationDelay: "160ms" }}>
        New vocabulary
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
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

      {/* the thing a tutor never catches mid-lesson — typed out live */}
      <div
        className={`mb-5 rounded-xl border border-amber/30 bg-amber/10 p-3.5 ${instant ? "" : "ct-rise"}`}
        style={instant ? undefined : { animationDelay: "760ms" }}
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[.7rem] font-bold uppercase tracking-wider text-brand-deep">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3 2 21h20L12 3Z" />
            <path d="M12 9v5M12 17.5v.5" />
          </svg>
          Caught for you
        </div>
        <p className="min-h-[1.4rem] text-[.92rem] text-ink">
          <Typewriter key={CORRECTION} text={CORRECTION} startDelay={1000} instant={instant} />
        </p>
      </div>

      <div className="ct-rise flex items-center justify-between gap-3 border-t border-line pt-4" style={{ animationDelay: "220ms" }}>
        <span className="text-[.78rem] text-muted">Builds on 11 past lessons</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[.8rem] font-semibold text-ink transition-all duration-500 ${
            instant ? "ring-2 ring-brand/40" : "shadow-soft-sm"
          }`}
          style={instant ? { boxShadow: "0 8px 22px -6px rgba(210,140,0,.65)" } : undefined}
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand-deep transition-transform duration-200 hover:-translate-y-0.5">
      {children}
    </span>
  );
}
