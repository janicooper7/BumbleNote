"use client";

import { useEffect, useId, useState } from "react";

/**
 * Every so often a bee crosses the page. Purely decorative: it sits in a fixed,
 * click-through overlay behind the sticky header (z-40 vs z-50), is hidden from
 * assistive tech, and never spawns under `prefers-reduced-motion`.
 *
 * Motion is split over three nested elements so the passes compose without
 * fighting over one `transform`: the lane carries the crossing, the wander
 * carries a slow rise/fall, and the bob carries the quick wingbeat lurch.
 */

type Bee = {
  id: number;
  top: number; // % of viewport height the lane starts at
  dur: number; // seconds for one crossing
  delay: number; // seconds, staggers the second bee of a pair
  scale: number;
  rtl: boolean; // crossing right-to-left
  drift: number; // px of slow vertical wander over the crossing
  bob: number; // seconds per bob
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Cadence. The first bee waits for the hero to settle and be read; after that
// it's a visit every half-minute or so. Crossings run 15-23s, so there's a bee
// on screen roughly half the time — a bit of personality, not a permanent
// competitor for the copy. (It used to be one every ~10s, i.e. nearly always.)
const FIRST: [number, number] = [8_000, 14_000];
const GAP: [number, number] = [22_000, 38_000];
const HIDDEN_RETRY = 5_000;
// Chance a visit is a pair rather than a single bee.
const PAIR_CHANCE = 0.15;

export default function BeeFlight() {
  const [bees, setBees] = useState<Bee[]>([]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let seq = 0;
    let timer = 0;
    const pending = new Set<number>();

    const schedule = (ms: number) => {
      timer = window.setTimeout(spawn, ms);
    };

    function spawn() {
      // Animations keep burning through a backgrounded tab, so a bee spawned
      // there would be gone before anyone could see it. Wait for the tab back.
      if (document.hidden) return schedule(HIDDEN_RETRY);

      // Usually one bee; now and then a pair, the second trailing behind.
      const batch: Bee[] = [];
      const count = Math.random() < PAIR_CHANCE ? 2 : 1;
      const rtl = Math.random() < 0.5;
      const top = rand(12, 76);

      for (let i = 0; i < count; i++) {
        const id = ++seq;
        const dur = rand(15, 23);
        const delay = i === 0 ? 0 : rand(0.9, 2.4);
        batch.push({
          id,
          top: top + (i === 0 ? 0 : rand(-7, 7)),
          dur,
          delay,
          scale: rand(0.5, 0.85),
          rtl,
          drift: rand(-90, 90),
          bob: rand(1.5, 2.1),
        });
        const done = window.setTimeout(
          () => {
            pending.delete(done);
            setBees((prev) => prev.filter((b) => b.id !== id));
          },
          (dur + delay) * 1000 + 250,
        );
        pending.add(done);
      }

      setBees((prev) => [...prev, ...batch]);
      schedule(rand(...GAP));
    }

    const sync = () => {
      window.clearTimeout(timer);
      if (motion.matches) {
        // The global reduced-motion rule kills animations outright, which would
        // strand a mid-flight bee in place. Clear the sky instead.
        pending.forEach(window.clearTimeout);
        pending.clear();
        setBees([]);
        return;
      }
      schedule(rand(...FIRST));
    };

    sync();
    motion.addEventListener("change", sync);
    return () => {
      window.clearTimeout(timer);
      pending.forEach(window.clearTimeout);
      motion.removeEventListener("change", sync);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      {bees.map((b) => (
        <div
          key={b.id}
          className="bee-lane absolute left-0"
          style={{
            top: `${b.top}%`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            animationDirection: b.rtl ? "reverse" : "normal",
          }}
        >
          <div
            className="bee-wander"
            style={
              {
                "--bee-drift": `${b.drift}px`,
                animationDuration: `${b.dur}s`,
                animationDelay: `${b.delay}s`,
              } as React.CSSProperties
            }
          >
            <div className="bee-bob" style={{ animationDuration: `${b.bob}s` }}>
              <BeeSvg scale={b.scale} flip={b.rtl} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The mascot in miniature — shades and all, so it reads as the logo bee rather
 * than a generic insect. Drawn facing right; `flip` mirrors it for the other
 * crossing. Scale rides on the <svg> itself, which is the one node in the stack
 * with no animation of its own to overwrite.
 */
function BeeSvg({ scale, flip }: { scale: number; flip: boolean }) {
  const ink = "#101a2e";
  const belly = useId();
  return (
    <svg
      width={64}
      height={48}
      viewBox="0 0 64 48"
      fill="none"
      style={{
        transform: `scale(${flip ? -scale : scale}, ${scale})`,
        filter: "drop-shadow(0 6px 8px rgba(22,35,61,.16))",
      }}
    >
      <g
        stroke={ink}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* far wing, tucked behind the body — swept further back so the pair
            doesn't read as one blob. The resting sweep lives on a wrapper <g>
            because the flap animates `transform` on the ellipse, and a CSS
            transform replaces the attribute rather than adding to it. */}
        <g transform="rotate(-32 19 12.5)">
          <ellipse
            className="bee-wing bee-wing-far"
            cx="19"
            cy="12.5"
            rx="10"
            ry="5.4"
            fill="#cfe6fb"
          />
        </g>

        {/* stinger */}
        <path d="M13 26.5 4.5 24l1.5 8.5z" fill={ink} />

        {/* abdomen */}
        <ellipse cx="27" cy="29" rx="15" ry="10.5" fill="var(--color-brand)" />
        <clipPath id={belly}>
          <ellipse cx="27" cy="29" rx="15" ry="10.5" />
        </clipPath>
        <g clipPath={`url(#${belly})`} stroke="none" fill={ink}>
          <path d="M17 16h5.5l-3.5 26h-5.5z" />
          <path d="M27 16h5.5l-3.5 26h-5.5z" />
        </g>

        {/* head */}
        <circle cx="45" cy="24.5" r="9.4" fill="var(--color-brand)" />
        {/* shades: two lenses, a bridge, and a temple arm back to the head */}
        <g fill={ink} stroke="none">
          <rect x="37.6" y="19.4" width="7.6" height="6.6" rx="2.6" />
          <rect x="46.2" y="19.4" width="7.4" height="6.6" rx="2.6" />
          <rect x="44.6" y="20.8" width="2.2" height="1.9" />
          <rect x="35.9" y="20.2" width="2.6" height="2" rx="1" />
        </g>
        {/* grin */}
        <path
          d="M42.6 29.4c1.6 1.9 4.4 1.9 6-.2"
          fill="none"
          strokeWidth={2.1}
        />

        {/* near wing, over the body */}
        <g transform="rotate(-20 29 13.5)">
          <ellipse
            className="bee-wing"
            cx="29"
            cy="13.5"
            rx="12"
            ry="6.4"
            fill="#e6f2ff"
            fillOpacity={0.92}
          />
        </g>

        {/* antennae last, gold-tipped like the lockup: drawn over the near wing,
            which otherwise swallows the left one, and swept up into a V so both
            tips clear the wingtip */}
        <path d="M42.2 17C41 12 40.6 9.4 40.8 7.6" fill="none" />
        <path d="M48 16.5C49.4 11.6 51 9 52.6 7.6" fill="none" />
        <circle cx="40.7" cy="6.6" r="2.5" fill="var(--color-brand-lit)" />
        <circle cx="53.4" cy="6.7" r="2.5" fill="var(--color-brand-lit)" />
      </g>
    </svg>
  );
}
