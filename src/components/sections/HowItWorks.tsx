"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "../Reveal";
import { Display, Eyebrow, Script } from "../bn/Bn";

const STEP_MS = 7200;

const steps = [
  {
    n: 1,
    tag: "recording",
    title: "Hit record, then teach as usual",
    body: "Open BumbleNote beside your lesson, pick your student, and share your lesson tab with its audio. No bot joins your call. Keep the BumbleNote tab open while you teach.",
  },
  {
    n: 2,
    tag: "listening",
    title: "It listens & separates",
    body: "Your lesson tab carries your student's voice and your mic carries yours, so the two are kept apart from the start — no guessing who said what.",
  },
  {
    n: 3,
    tag: "drafting",
    title: "The draft writes itself",
    body: "Vocabulary in context, mistakes caught, next-lesson plan — written against everything the student has done so far. You type nothing.",
  },
  {
    n: 4,
    tag: "review",
    title: "Review & send",
    body: "Tweak anything, confirm, and email a clean PDF. The audio is discarded — only your notes are kept.",
  },
];

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  // Someone picked a step themselves: stop auto-advancing for good. The demo is
  // theirs now, and it shouldn't be pulled to the next step mid-read.
  const [manual, setManual] = useState(false);
  // Pointer or keyboard focus is inside the demo: hold the current step.
  const [paused, setPaused] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // reduced-motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  // only animate while the demo is on screen
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Auto-advance is driven by the progress bar's own CSS animation (see
  // onAnimationEnd below) rather than a separate timer, so pausing the bar with
  // animation-play-state pauses the advance too — the two can't drift apart.
  const auto = inView && !reduced && !manual;

  return (
    // Template 14: the steps as a stack of cocoa pills, here on white.
    <section id="how" className="bg-white py-24">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal className="mx-auto mb-14 max-w-3xl text-center">
          <Eyebrow className="text-ink-soft">How it works</Eyebrow>
          <Display className="mt-5 text-[clamp(2.3rem,5vw,3.8rem)] text-cocoa">
            From live lesson <Script>to</Script>
            <br className="hidden sm:block" /> polished feedback
          </Display>
          <p className="mx-auto mt-6 max-w-[52ch] text-lg text-ink-soft">
            Start your lesson as usual. BumbleNote handles the rest and hands you a draft
            when you stop recording.
          </p>
        </Reveal>

        <Reveal className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12">
          {/* ---- progress steps ---- */}
          <ol
            className="flex flex-col gap-2.5"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {steps.map((s, i) => {
              const isActive = i === active;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(i);
                      setManual(true);
                    }}
                    aria-current={isActive ? "step" : undefined}
                    className={`group flex w-full items-start gap-4 rounded-[30px] p-4 text-left transition-all duration-300 sm:px-6 sm:py-5 ${
                      isActive
                        ? "bg-cocoa text-butter"
                        : "bg-cocoa/[.08] text-cocoa hover:bg-cocoa/[.14]"
                    }`}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-xl transition-colors duration-300 ${
                        isActive ? "bg-butter text-cocoa" : "bg-cocoa text-butter"
                      }`}
                    >
                      {s.n}
                    </span>
                    <span className="min-w-0 flex-1 pt-1.5">
                      <span className="block text-[.92rem] font-semibold uppercase tracking-[.12em]">
                        {s.title}
                      </span>
                      <span
                        className={`grid overflow-hidden transition-all duration-500 ${
                          isActive
                            ? "mt-1 grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <span className="min-h-0 text-[.97rem] text-butter/85">
                          {s.body}
                        </span>
                      </span>
                      {/* auto-advance progress bar */}
                      <span
                        className={`mt-3 block h-[3px] overflow-hidden rounded-full ${
                          isActive ? "bg-butter/20" : "bg-cocoa/10"
                        }`}
                      >
                        <span
                          key={active}
                          className="block h-full rounded-full bg-butter"
                          style={
                            isActive
                              ? auto
                                ? {
                                    animation: `ct-progress ${STEP_MS}ms linear forwards`,
                                    animationPlayState: paused ? "paused" : "running",
                                  }
                                : { width: "100%" }
                              : { width: 0 }
                          }
                          onAnimationEnd={
                            isActive && auto
                              ? () => setActive((a) => (a + 1) % steps.length)
                              : undefined
                          }
                        />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* ---- animated app window ----
              Pure illustration of the step beside it, so it's hidden from assistive
              tech rather than read out as a second, mock UI. */}
          <div
            ref={stageRef}
            aria-hidden
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="overflow-hidden rounded-[28px] border-[1.5px] border-cocoa bg-surface"
          >
            {/* window chrome */}
            <div className="flex items-center gap-2 border-b-[1.5px] border-cocoa bg-butter px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-cocoa" />
              <span className="h-3 w-3 rounded-full bg-sky ring-1 ring-cocoa/30" />
              <span className="h-3 w-3 rounded-full bg-white ring-1 ring-cocoa/30" />
              <span className="ml-3 rounded-full bg-cocoa px-3 py-1 text-[.66rem] font-semibold uppercase tracking-[.16em] text-butter">
                bumblenote · {steps[active].tag}
              </span>
            </div>

            {/* scene */}
            <div className="relative min-h-[380px] p-6 sm:min-h-[420px] sm:p-8">
              <Scene key={active} step={active} playing={inView && !reduced && !paused} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- scenes ---------------- */

function Scene({ step, playing }: { step: number; playing: boolean }) {
  if (step === 0) return <SceneRecord playing={playing} />;
  if (step === 1) return <SceneListen playing={playing} />;
  if (step === 2) return <SceneDraft playing={playing} />;
  return <SceneSend />;
}

function rise(delay: number): React.CSSProperties {
  return { animationDelay: `${delay}ms` };
}

/* Step 1 — pick the student, share the lesson tab, recording */
function SceneRecord({ playing }: { playing: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="ct-rise w-full max-w-[340px] rounded-[20px] border border-line bg-white p-5 shadow-soft-md">
        <div className="font-display text-lg font-medium text-ink">Record a lesson</div>
        <p className="mb-3 text-sm text-ink-soft">Who is this lesson with?</p>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-line bg-brand-soft px-3 py-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-semibold text-ink">
            M
          </span>
          <span className="font-medium text-ink">Maria García</span>
          <span className="ml-auto text-brand-deep">✓</span>
        </div>

        <div className="ct-rise mb-4 rounded-xl border border-line bg-bg-tint/60 p-3 text-[.82rem]" style={rise(200)}>
          <div className="mb-2 font-semibold text-ink">Your browser asks what to share</div>
          {["Your lesson tab", "Share tab audio"].map((t) => (
            <div key={t} className="mt-1 flex items-center gap-2 text-ink-soft">
              <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-brand text-[.62rem] font-bold text-ink">
                ✓
              </span>
              {t}
            </div>
          ))}
        </div>

        <div className="ct-rise flex items-center justify-center gap-3 rounded-xl bg-ink px-4 py-3 text-white" style={rise(400)}>
          <span className={`h-3 w-3 rounded-full bg-[#ff6b6b] ${playing ? "animate-pulse-dot" : ""}`} />
          <span className="font-medium">Recording</span>
          <span className="font-display tabular-nums text-white/80">00:14</span>
        </div>
      </div>

      <p className="ct-rise mt-3 text-center text-[.78rem] text-muted" style={rise(520)}>
        No bot in your call · keep this tab open while you teach
      </p>
    </div>
  );
}

/* Step 2 — voice separation + live transcript */
function SceneListen({ playing }: { playing: boolean }) {
  const bars = [45, 70, 40, 82, 55, 90, 60, 78, 50, 84, 44, 66, 58, 88, 48, 72];
  const lines = [
    { who: "You", text: "So, how did the negotiation go?", me: true },
    { who: "Maria", text: "We postpone the deadline until Friday.", me: false },
    { who: "You", text: "Nice — we'd say \"postponed\".", me: true },
  ];
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="ct-rise grid grid-cols-2 gap-3">
        {[
          { label: "You", color: "var(--color-brand)" },
          { label: "Maria", color: "var(--color-mint)" },
        ].map((track, ti) => (
          <div key={track.label} className="rounded-xl border border-line bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-[.74rem] font-semibold text-ink-soft">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: track.color }} />
              {track.label}
            </div>
            <div className="flex h-9 items-end gap-[3px]">
              {bars.map((h, i) => (
                <span
                  key={i}
                  className={`w-full rounded-sm ${playing ? "ct-eq" : ""}`}
                  style={{
                    height: `${h}%`,
                    background: track.color,
                    opacity: 0.35 + (i % 5) * 0.13,
                    animationDelay: `${(i * 70 + ti * 120) % 900}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {lines.map((l, i) => (
          <div
            key={i}
            className="ct-rise flex gap-2.5"
            style={rise(200 + i * 260)}
          >
            <span
              className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[.7rem] font-bold"
              style={{
                color: "var(--color-ink)",
                background: l.me ? "var(--color-butter)" : "var(--color-sky)",
              }}
            >
              {l.who}
            </span>
            <span className="text-[.95rem] text-ink">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Step 3 — draft writing itself */
function SceneDraft({ playing }: { playing: boolean }) {
  const words = ["to negotiate", "deadline", "to postpone", "on second thought"];
  return (
    <div className="flex h-full flex-col">
      <div className="ct-rise mb-4 flex items-center gap-2 text-[.74rem] font-semibold uppercase tracking-wide text-brand-deep">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand" />
        Drafting from this lesson + 11 before it
      </div>

      <div className="ct-rise mb-1 text-[.72rem] font-semibold uppercase tracking-wide text-muted" style={rise(120)}>
        New words in context
      </div>
      <div className="ct-rise mb-5 flex flex-wrap gap-2" style={rise(160)}>
        {words.map((w) => (
          <span
            key={w}
            className="rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand-deep"
          >
            {w}
          </span>
        ))}
      </div>

      <div className="ct-rise mb-1 text-[.72rem] font-semibold uppercase tracking-wide text-muted" style={rise(320)}>
        Areas to improve
      </div>
      <ul className="mb-5 flex flex-col gap-2 text-[.95rem] text-ink">
        {[
          "Articles before abstract nouns (“advice”)",
          "Past tense: “postpone” → “postponed”",
        ].map((t, i) => (
          <li key={i} className="ct-rise flex gap-2.5" style={rise(360 + i * 220)}>
            <span className="text-brand-deep">→</span>
            {t}
          </li>
        ))}
      </ul>

      <div
        className="ct-rise mt-auto flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-[.92rem] font-medium text-brand-deep"
        style={rise(820)}
      >
        → Next lesson: role-play negotiating a deadline
        <span className={`ml-1 inline-block h-4 w-[2px] bg-ink ${playing ? "ct-caret" : ""}`} />
      </div>
    </div>
  );
}

/* Step 4 — review & send */
function SceneSend() {
  return (
    <div className="flex h-full flex-col">
      <div className="ct-rise flex-1 rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-lg font-medium text-ink">Maria&apos;s recap</span>
          <span className="rounded-md border border-brand-line bg-brand-soft px-2 py-1 text-[.68rem] font-bold text-brand-deep">
            PDF
          </span>
        </div>
        <div className="space-y-2.5">
          <div className="h-2.5 w-11/12 rounded-full bg-line" />
          <div className="h-2.5 w-4/5 rounded-full bg-line" />
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2/5 rounded-full bg-brand-soft" />
            <span className="inline-block h-4 w-[2px] bg-ink ct-caret" />
          </div>
          <div className="h-2.5 w-3/4 rounded-full bg-line" />
        </div>
      </div>

      <div className="ct-rise mt-4 flex items-center gap-3" style={rise(240)}>
        {/* A picture of the button, not a control — a real <button> here would be
            a keyboard tab stop that does nothing. */}
        <span className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-medium text-ink shadow-soft-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
          Send PDF
        </span>
        <span className="text-[.86rem] text-ink-soft">
          → maria@email.com · audio discarded
        </span>
      </div>
    </div>
  );
}
