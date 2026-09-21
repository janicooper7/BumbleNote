import Reveal from "../Reveal";

const timeline = [
  { date: "Lesson 9 · 11 Jun", txt: "Introduced past perfect — shaky.", active: false },
  { date: "Lesson 10 · 18 Jun", txt: "Past perfect improving; articles still slipping.", active: false },
  { date: "Lesson 11 · 25 Jun", txt: "Confident with tenses. Focus shifts to pronunciation.", active: false },
  { date: "Lesson 12 · 2 Jul · suggested next", txt: "Business vocab + /θ/ drills. Ready for B2 reading.", active: true },
];

export default function Journey() {
  return (
    <section id="journey" className="py-24">
      <div className="mx-auto w-full max-w-[1160px] px-8">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-[32px] p-7 text-white sm:p-12 md:p-16"
            style={{ background: "linear-gradient(150deg,var(--panel),var(--panel-lift))" }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(50% 60% at 85% 10%, rgba(253,179,0,.18), transparent 60%)",
              }}
            />
            <div className="relative grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-12">
              <div>
                <div className="text-[.82rem] font-bold uppercase tracking-widest text-brand-lit">
                  The student journey
                </div>
                <h2 className="mt-3.5 font-display text-[clamp(2rem,3.6vw,2.7rem)] font-medium leading-tight text-white">
                  It remembers every lesson, so you don&apos;t have to.
                </h2>
                <p className="mt-4 text-lg text-[var(--panel-text)]">
                  BumbleNote builds a living profile for each student — a growing
                  vocabulary bank, recurring error patterns, and a level trajectory. Every
                  new draft is written with their whole history in mind, so &ldquo;what to
                  focus on next&rdquo; is always grounded in real progress.
                </p>
              </div>

              <div className="rounded-[20px] border border-white/15 bg-white/[.08] p-6 backdrop-blur">
                {timeline.map((row, i) => (
                  <div
                    key={i}
                    className={`flex gap-4 py-3.5 ${
                      i < timeline.length - 1 ? "border-b border-white/12" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-3 w-3 flex-none rounded-full ${
                        row.active
                          ? "bg-[#5ee0c8] shadow-[0_0_0_4px_rgba(94,224,200,.25)]"
                          : "bg-[#fdb300] shadow-[0_0_0_4px_rgba(253,179,0,.28)]"
                      }`}
                    />
                    <div>
                      <div className="text-[.8rem] text-[var(--panel-dim)]">{row.date}</div>
                      <div className="text-[.98rem] text-[var(--panel-text)]">{row.txt}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
