import { Asterisk, Eyebrow } from "../bn/Bn";

// BumbleNote captures one browser tab's audio plus the mic, so what matters is
// that the lesson runs in a browser tab — not which brand hosts it. The desktop
// Zoom / Teams apps don't qualify, so those two are labelled as their web
// versions rather than listed bare.
const platforms = [
  "Google Meet",
  "Zoom (web)",
  "Microsoft Teams (web)",
  "Preply",
  "italki",
  "Cambly",
];

// Template 30: powder-blue pills, cocoa asterisk, bold spaced capitals — on a
// cocoa band so the page alternates white / cocoa section by section.
export default function PlatformStrip() {
  return (
    <div className="bg-cocoa text-butter">
      <div className="mx-auto w-full max-w-[1100px] px-5 py-14 text-center sm:px-8">
        <Eyebrow className="text-sky">
          Works with any lesson that runs in a browser tab
        </Eyebrow>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {platforms.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-2.5 rounded-2xl bg-sky px-5 py-3 text-[.82rem] font-semibold uppercase tracking-[.12em] text-cocoa"
            >
              <Asterisk className="h-4 w-4" />
              {p}
            </span>
          ))}
          <span className="inline-flex items-center gap-2.5 rounded-2xl bg-sky px-5 py-3 text-[.82rem] font-semibold uppercase tracking-[.12em] text-cocoa">
            <Asterisk className="h-4 w-4" />
            + any browser call + many more
          </span>
        </div>
        <p className="mt-6 text-[.95rem] text-butter/80">
          No bots, no join links. Teach in the Zoom or Teams desktop app? Open its web
          version for that lesson.
        </p>
      </div>
    </div>
  );
}
