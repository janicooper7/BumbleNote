import CtaLink from "../CtaLink";
import HeroVisual from "./HeroVisual";

// Nothing in here waits on client JS to become visible: the entrance is a plain
// CSS animation (`ct-rise`), so the headline paints with the first HTML instead
// of after hydration.

const points = [
  "Vocabulary in context, plus the mistakes you’d never catch mid-lesson",
  "A progress plan for every student, built from all their lessons",
  "Nothing to install — no bot joins your call",
];

export default function Hero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="pb-16 pt-20">
      <div className="mx-auto grid w-full max-w-[1160px] grid-cols-1 items-center gap-16 px-8 md:grid-cols-[1.05fr_.95fr]">
        {/* copy */}
        <div>
          <h1
            className="ct-rise font-display text-[clamp(2.6rem,5.6vw,4.3rem)] font-medium leading-[1.05] tracking-tight"
            style={{ animationDelay: "80ms" }}
          >
            Teach the lesson.{" "}
            <em className="italic text-brand-deep">The feedback writes itself.</em>
          </h1>

          <p
            className="ct-rise mt-5 max-w-[46ch] text-xl text-ink-soft"
            style={{ animationDelay: "160ms" }}
          >
            BumbleNote records your 1-to-1 English lessons in your browser and turns
            each one into finished feedback for your student. You just review and send.
          </p>

          <ul
            className="ct-rise mt-5 flex max-w-[52ch] flex-col gap-2.5 text-[1.02rem] text-ink"
            style={{ animationDelay: "220ms" }}
          >
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-[3px] grid h-5 w-5 flex-none place-items-center rounded-full bg-brand-soft text-[.68rem] font-bold text-brand-deep"
                >
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>

          <div
            className="ct-rise mt-9 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "280ms" }}
          >
            {signedIn ? (
              <CtaLink href="/dashboard" arrow>
                Go to your dashboard
              </CtaLink>
            ) : (
              <CtaLink href="/signup" arrow>
                Start free trial
              </CtaLink>
            )}
            <CtaLink href="#how" variant="secondary">
              See how it works ↓
            </CtaLink>
          </div>

          <div
            className="ct-rise mt-6 flex flex-col gap-1 text-[.92rem] text-ink-soft"
            style={{ animationDelay: "340ms" }}
          >
            {!signedIn && <span>Free for 1 student and 2 lessons · no card required</span>}
            <span>You confirm every note before it&apos;s sent</span>
          </div>
        </div>

        {/* visual */}
        <HeroVisual />
      </div>
    </section>
  );
}
