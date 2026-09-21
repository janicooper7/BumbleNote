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

export default function PlatformStrip() {
  return (
    <div className="py-11">
      <div className="mx-auto w-full max-w-[1160px] px-8 text-center">
        <p className="text-[.95rem] font-semibold text-ink-soft">
          Works with any lesson that runs in a browser tab — no bots, no join links.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {platforms.map((p) => (
            <span
              key={p}
              className="inline-flex items-center rounded-full border border-line bg-white/70 px-4 py-2 text-sm font-semibold text-ink-soft"
            >
              {p}
            </span>
          ))}
          <span className="inline-flex items-center rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-deep">
            + any browser call
          </span>
        </div>
        <p className="mt-4 text-[.86rem] text-muted">
          Teach in the Zoom or Teams desktop app? Open its web version for that lesson.
        </p>
      </div>
    </div>
  );
}
