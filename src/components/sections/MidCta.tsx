import CtaLink from "../CtaLink";

// A quiet nudge right after the sample recap — the point where a tutor has just
// seen what their student would receive. Without it the first call to action
// after the hero is five screens down, at the pricing table.
export default function MidCta({ signedIn = false }: { signedIn?: boolean }) {
  if (signedIn) return null;
  return (
    <div className="pb-4">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col items-center gap-5 px-8 text-center">
        <p className="font-display text-xl text-ink-soft sm:text-2xl">
          Try it on your next lesson — the first two are free.
        </p>
        <CtaLink href="/signup" arrow>
          Start free trial
        </CtaLink>
        <span className="-mt-1 text-[.9rem] text-ink-soft">1 student · 2 lessons · no card required</span>
      </div>
    </div>
  );
}
