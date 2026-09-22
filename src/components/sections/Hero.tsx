import CtaLink from "../CtaLink";
import HeroVisual from "./HeroVisual";
import { Display, Script } from "../bn/Bn";

// The original hero layout — headline and copy on the left, the live lesson
// card on the right — in the site's type: Gilda capitals with the Pinyon script
// line across them, Jost for the copy and pills, like every other section.
// Nothing in here waits on client JS to become visible: the entrance is a plain
// CSS animation (`ct-rise`), so the headline paints with the first HTML instead
// of after hydration.

export default function Hero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="bg-white pb-16 pt-16 md:pt-20">
      <div className="mx-auto grid w-full max-w-[1160px] grid-cols-1 items-center gap-12 px-5 sm:px-8 md:grid-cols-[1.2fr_.8fr]">
        {/* copy */}
        <div>
          <Display
            as="h1"
            className="ct-rise text-[clamp(2.1rem,4.4vw,3.8rem)] text-cocoa"
            style={{ animationDelay: "80ms" }}
          >
            <span className="whitespace-nowrap">Teach the lesson.</span>
            <Script block className="text-sky-deep">
              the feedback
            </Script>
            writes itself.
          </Display>

          <p
            className="ct-rise mt-7 max-w-[40ch] text-xl text-ink-soft"
            style={{ animationDelay: "160ms" }}
          >
            BumbleNote records your 1-to-1 English lessons in your browser and turns
            each one into finished feedback: vocabulary in context, the mistakes
            you&apos;d never catch mid-lesson, and a progress plan for every student.
            You just review and send.
          </p>

          <div
            className="ct-rise mt-9 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "240ms" }}
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
            <CtaLink href="#how" variant="outline" className="bg-white/50 text-cocoa">
              See how it works
            </CtaLink>
          </div>
        </div>

        {/* visual */}
        <HeroVisual />
      </div>
    </section>
  );
}
