import Reveal from "../Reveal";
import CtaLink from "../CtaLink";
import { Asterisk, Display, Eyebrow, Script } from "../bn/Bn";
import { SignedIn, SignedOut } from "../SignedIn";

// The closing call to action, laid out like the pack's announcement posts
// ("GET READY / SOMETHING *etheral* IS COMING" — 12): small caps, capitals with
// a script word across them, one pill. A plain rounded butter panel on cocoa.
export default function CtaBand() {
  return (
    <section className="relative overflow-hidden bg-cocoa py-24">
      <Asterisk className="pointer-events-none absolute left-[8%] top-16 hidden h-9 w-9 text-sky md:block" />
      <Asterisk className="pointer-events-none absolute bottom-20 right-[9%] hidden h-12 w-12 text-butter md:block" />
      <div className="mx-auto w-full max-w-[880px] px-5 sm:px-8">
        <Reveal>
          <div className="rounded-[36px] bg-butter px-8 py-16 text-center sm:px-16 sm:py-20">
            <Eyebrow className="text-ink-soft">Spend your energy teaching</Eyebrow>
            <Display className="mt-6 text-[clamp(2.2rem,5vw,3.6rem)] text-cocoa">
              Better feedback
              <Script block className="text-sky-deep">
                for every
              </Script>
              student
            </Display>
            <p className="mx-auto mt-6 max-w-[40ch] text-lg text-ink-soft">
              Let BumbleNote remember, write, and track the rest.
            </p>
            <SignedIn>
              <CtaLink href="/dashboard" arrow className="mt-9">
                Go to your dashboard
              </CtaLink>
            </SignedIn>
            <SignedOut>
              <CtaLink href="/signup" arrow className="mt-9">
                Start free trial
              </CtaLink>
              <Eyebrow className="mt-5 text-ink-soft">1 student · 2 lessons · no card</Eyebrow>
            </SignedOut>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
