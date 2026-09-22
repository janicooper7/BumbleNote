import Reveal from "../Reveal";
import { Display, Eyebrow, LoopArrow, Script } from "../bn/Bn";

// Templates 45 and 46: the lessons as tilted polaroids on white, joined
// by hand-drawn arrows. The last one — the suggested next lesson — is the cocoa
// card, the one the eye should land on.

const timeline = [
  { n: 9, date: "11 Jun", txt: "Introduced past perfect — shaky.", tilt: "md:-rotate-3" },
  { n: 10, date: "18 Jun", txt: "Past perfect improving; articles still slipping.", tilt: "md:rotate-2" },
  { n: 11, date: "25 Jun", txt: "Confident with tenses. Focus shifts to pronunciation.", tilt: "md:-rotate-2" },
  { n: 12, date: "2 Jul", txt: "Business vocab + /θ/ drills. Ready for B2 reading.", tilt: "md:rotate-3", next: true },
];

export default function Journey() {
  return (
    <section id="journey" className="bg-white pb-24 pt-24">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow className="text-ink-soft">The student journey</Eyebrow>
          <Display className="mt-5 text-[clamp(2.3rem,5vw,3.8rem)] text-cocoa">
            It remembers
            <Script block className="text-sky-deep">
              every lesson
            </Script>
            so you don&apos;t have to
          </Display>
          <p className="mx-auto mt-6 max-w-[58ch] text-lg text-ink-soft">
            BumbleNote builds a living profile for each student — a growing vocabulary
            bank, recurring error patterns, and a level trajectory. Every new draft is
            written with their whole history in mind, so &ldquo;what to focus on
            next&rdquo; is always grounded in real progress.
          </p>
        </Reveal>

        <ol className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {timeline.map((row, i) => (
            <Reveal as="li" key={row.n} delay={i * 110} className="relative">
              <div
                className={`flex h-full flex-col rounded-[6px] p-3 pb-5 shadow-[0_18px_40px_-18px_rgba(65,46,40,.45)] transition-transform duration-500 md:hover:rotate-0 ${row.tilt} ${
                  row.next ? "bg-cocoa text-butter" : "bg-white text-ink ring-1 ring-cocoa/10"
                }`}
              >
                {/* the "photo" */}
                <div
                  className={`grid aspect-[4/3] place-items-center rounded-[3px] ${
                    row.next ? "bg-sky text-cocoa" : "bg-sky-soft text-cocoa"
                  }`}
                >
                  <div className="text-center">
                    <div className="text-[.68rem] font-semibold uppercase tracking-[.2em] opacity-75">
                      Lesson
                    </div>
                    <div className="font-display text-6xl leading-none">{row.n}</div>
                  </div>
                </div>
                {/* the caption strip */}
                <div className="px-1.5 pt-4">
                  <div
                    className={`text-[.7rem] font-semibold uppercase tracking-[.18em] ${
                      row.next ? "text-sky" : "text-muted"
                    }`}
                  >
                    {row.date}
                    {row.next && " · suggested next"}
                  </div>
                  <p className="mt-1.5 text-[1rem] leading-snug">{row.txt}</p>
                </div>
              </div>
              {i < timeline.length - 1 && (
                <LoopArrow className="pointer-events-none absolute -right-9 top-6 z-10 hidden h-10 w-14 text-cocoa lg:block" />
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
