import CtaLink from "../CtaLink";
import { Display, Eyebrow, Script } from "../bn/Bn";
import { SignedOut } from "../SignedIn";

// A quiet nudge right after the sample recap — the point where a tutor has just
// seen what their student would receive. Without it the first call to action
// after the hero is five screens down, at the pricing table. Laid out like the
// pack's announcement posts (2, 37): script over capitals, one pill, small caps.
// Shares FeedbackSplit's cocoa so it reads as that section's close, and the
// white / cocoa alternation holds whether or not it renders.
export default function MidCta() {
  return (
    <SignedOut>
      <div className="bg-cocoa text-butter">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center px-5 pb-24 pt-4 text-center sm:px-8">
          <Display as="h2" className="text-[clamp(2.2rem,5vw,3.6rem)]">
            <Script block className="text-sky">
              try it on your next lesson
            </Script>
            The first two are free
          </Display>
          <CtaLink href="/signup" variant="light" arrow className="mt-9">
            Start free trial
          </CtaLink>
          <Eyebrow className="mt-5 text-butter/75">1 student · 2 lessons · no card</Eyebrow>
        </div>
      </div>
    </SignedOut>
  );
}
