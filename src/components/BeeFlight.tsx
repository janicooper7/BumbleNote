'use client'

import { useEffect, useId, useState } from 'react'

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
  id: number
  top: number // % of viewport height the lane starts at
  dur: number // seconds for one crossing
  delay: number // seconds, staggers the second bee of a pair
  scale: number
  rtl: boolean // crossing right-to-left
  drift: number // px of slow vertical wander over the crossing
  bob: number // seconds per bob
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

// Cadence. The first bee shows up almost straight away; after that there's a
// new one every several seconds. Crossings run 15-23s, so there are usually a
// couple of bees on screen at once.
const FIRST: [number, number] = [2_000, 4_000]
const GAP: [number, number] = [5_000, 9_000]
const HIDDEN_RETRY = 5_000
// Chance a visit is a pair rather than a single bee.
const PAIR_CHANCE = 0.15

export default function BeeFlight() {
  const [bees, setBees] = useState<Bee[]>([])

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let seq = 0
    let timer = 0
    const pending = new Set<number>()

    const schedule = (ms: number) => {
      timer = window.setTimeout(spawn, ms)
    }

    function spawn() {
      // Animations keep burning through a backgrounded tab, so a bee spawned
      // there would be gone before anyone could see it. Wait for the tab back.
      if (document.hidden) return schedule(HIDDEN_RETRY)

      // Usually one bee; now and then a pair, the second trailing behind.
      const batch: Bee[] = []
      const count = Math.random() < PAIR_CHANCE ? 2 : 1
      const rtl = Math.random() < 0.5
      const top = rand(12, 76)

      for (let i = 0; i < count; i++) {
        const id = ++seq
        const dur = rand(15, 23)
        const delay = i === 0 ? 0 : rand(0.9, 2.4)
        batch.push({
          id,
          top: top + (i === 0 ? 0 : rand(-7, 7)),
          dur,
          delay,
          scale: rand(0.8, 1.2),
          rtl,
          drift: rand(-90, 90),
          bob: rand(1.5, 2.1),
        })
        const done = window.setTimeout(
          () => {
            pending.delete(done)
            setBees((prev) => prev.filter((b) => b.id !== id))
          },
          (dur + delay) * 1000 + 250,
        )
        pending.add(done)
      }

      setBees((prev) => [...prev, ...batch])
      schedule(rand(...GAP))
    }

    const sync = () => {
      window.clearTimeout(timer)
      if (motion.matches) {
        // The global reduced-motion rule kills animations outright, which would
        // strand a mid-flight bee in place. Clear the sky instead.
        pending.forEach(window.clearTimeout)
        pending.clear()
        setBees([])
        return
      }
      schedule(rand(...FIRST))
    }

    sync()
    motion.addEventListener('change', sync)
    return () => {
      window.clearTimeout(timer)
      pending.forEach(window.clearTimeout)
      motion.removeEventListener('change', sync)
    }
  }, [])

  return (
    <div
      aria-hidden
      className='pointer-events-none fixed inset-0 z-40 overflow-hidden'
    >
      {bees.map((b) => (
        <div
          key={b.id}
          className='bee-lane absolute left-0'
          style={{
            top: `${b.top}%`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            animationDirection: b.rtl ? 'reverse' : 'normal',
          }}
        >
          <div
            className='bee-wander'
            style={
              {
                '--bee-drift': `${b.drift}px`,
                animationDuration: `${b.dur}s`,
                animationDelay: `${b.delay}s`,
              } as React.CSSProperties
            }
          >
            <div className='bee-bob' style={{ animationDuration: `${b.bob}s` }}>
              <BeeSvg scale={b.scale} flip={b.rtl} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The logo mark in flight: the same top-down bee — dark head and thorax, striped
 * pointed abdomen, four powder-blue wings, dot-tipped antennae — drawn head-up
 * like the icon, then turned a quarter so the head leads the crossing. `flip`
 * mirrors it for the other direction. Scale rides on the <svg> itself, the one
 * node in the stack with no animation of its own to overwrite, and the turn
 * lives inside the SVG so the drop shadow still falls downward.
 */
function BeeSvg({ scale, flip }: { scale: number; flip: boolean }) {
  const ink = '#3d2b25' // the mark's outline brown
  const belly = useId()
  const abdomen = 'M50 45.5C61.5 45.5 63.5 57 61 66.5L50 86.5 39 66.5C36.5 57 38.5 45.5 50 45.5Z'
  return (
    <svg
      width={60}
      height={60}
      viewBox='0 0 100 100'
      fill='none'
      style={{
        transform: `scale(${flip ? -scale : scale}, ${scale})`,
        filter: 'drop-shadow(0 6px 8px rgba(65,46,40,.2))',
      }}
    >
      <g
        transform='rotate(90 50 50)'
        stroke={ink}
        strokeWidth={3.4}
        strokeLinecap='round'
        strokeLinejoin='round'
      >
        {/* wings, both sides: the right pair is the left pair mirrored, so the
            flap mirrors too. Each wing's resting tilt sits on a wrapper <g>
            because the flap animates `transform` on the inner one. */}
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? 'translate(100 0) scale(-1 1)' : undefined}>
            <g transform='rotate(-22 30 59)'>
              <ellipse className='bee-wing bee-wing-low' cx='30' cy='59' rx='14' ry='6.8' fill='#c1d9e6' />
            </g>
            <g transform='rotate(10 25 38)'>
              <g className='bee-wing'>
                <ellipse cx='25' cy='38' rx='19.5' ry='9.2' fill='#c1d9e6' />
                {/* the highlight stroke along the top of each fore wing */}
                <path d='M12 35.5C20 32.4 31 33.4 39.5 37' strokeWidth={2.6} />
              </g>
            </g>
          </g>
        ))}

        {/* abdomen: butter with dark bands, tapering to the sting */}
        <path d={abdomen} fill='#fff0b5' />
        <clipPath id={belly}>
          <path d={abdomen} />
        </clipPath>
        <g clipPath={`url(#${belly})`} stroke='none' fill={ink}>
          <rect x='30' y='55.5' width='40' height='3.6' />
          <rect x='30' y='63' width='40' height='3.6' />
          <rect x='30' y='70.5' width='40' height='3.6' />
        </g>
        <path d={abdomen} />

        {/* thorax and head, solid like the mark */}
        <ellipse cx='50' cy='39.5' rx='8.6' ry='7.4' fill={ink} />
        <circle cx='50' cy='27' r='5.6' fill={ink} />

        {/* antennae with their dot tips */}
        <path d='M47.4 23C46.4 18.5 44.2 15.6 41 14.6' />
        <path d='M52.6 23C53.6 18.5 55.8 15.6 59 14.6' />
        <circle cx='40.4' cy='14.4' r='2.6' fill={ink} stroke='none' />
        <circle cx='59.6' cy='14.4' r='2.6' fill={ink} stroke='none' />
      </g>
    </svg>
  )
}
