import Reveal from "../Reveal";
import CtaLink from "../CtaLink";

export default function CtaBand({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="py-24">
      <div className="mx-auto w-full max-w-[1160px] px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] border border-line bg-surface px-10 py-18 text-center shadow-soft-md">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(50% 80% at 50% -10%, rgba(253,179,0,.2), transparent 60%)",
              }}
            />
            <h2 className="relative font-display text-[clamp(2rem,4vw,3rem)] font-medium tracking-tight">
              Give every student better feedback — in less time.
            </h2>
            <p className="relative mx-auto mt-4 max-w-[46ch] text-lg text-ink-soft">
              Spend your energy teaching. Let BumbleNote remember, write, and track the
              rest.
            </p>
            <CtaLink href={signedIn ? "/dashboard" : "/signup"} arrow className="relative mt-8">
              {signedIn ? "Go to your dashboard" : "Start free trial"}
            </CtaLink>
            {!signedIn && (
              <p className="relative mt-4 text-[.9rem] text-ink-soft">
                Free for 1 student and 2 lessons · no card required
              </p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
