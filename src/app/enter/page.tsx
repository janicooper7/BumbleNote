import type { Metadata } from "next";
import { enterSite } from "@/app/actions/gate";
import BeeFlight from "@/components/BeeFlight";
import Logo from "@/components/Logo";
import WaitlistForm from "@/components/auth/WaitlistForm";
import { Asterisk, Display, Eyebrow, Script, Sparkle } from "@/components/bn/Bn";
import { bnFontVars } from "@/components/bn/fonts";
import { safeReturnPath } from "@/lib/site-gate";

export const metadata: Metadata = {
  title: { absolute: "BumbleNote — coming soon" },
  // Nothing behind the gate should be indexed while the site is private.
  robots: { index: false, follow: false },
};

// The pre-launch page, in the homepage's template-pack look: sections alternate
// white / cocoa, big Gilda capitals with a Pinyon word across them. It's all
// "coming soon" — the one job is getting an email, so the form is in the first
// screen and again at the close. Early-access password stays tucked at the foot.

const coming = [
  {
    n: "01",
    title: "Record in your browser",
    body: "Share your lesson tab and teach as usual. No bot joins your call and there's nothing to install.",
  },
  {
    n: "02",
    title: "The feedback writes itself",
    body: "Vocabulary in context, the mistakes you'd never catch mid-lesson, and a plan for next time — drafted for you.",
  },
  {
    n: "03",
    title: "It remembers every student",
    body: "Each draft builds on their whole history, so what to focus on next is grounded in real progress.",
  },
];

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  const target = safeReturnPath(from);

  return (
    <div className={`theme-bn ${bnFontVars} min-h-screen bg-white`}>
      <BeeFlight />

      {/* ---- coming soon ---- */}
      <section className="relative overflow-hidden bg-white px-5 pb-24 pt-10 sm:px-8">
        <Asterisk className="pointer-events-none absolute left-[7%] top-[38%] hidden h-10 w-10 text-sky-deep md:block" />
        <Sparkle className="pointer-events-none absolute right-[9%] top-[26%] hidden h-9 w-9 text-cocoa md:block" />
        <Asterisk className="pointer-events-none absolute bottom-16 right-[14%] hidden h-7 w-7 text-sky md:block" />

        <div className="mx-auto flex w-full max-w-[1100px] justify-center">
          <Logo />
        </div>

        <div className="mx-auto mt-16 flex max-w-[880px] flex-col items-center text-center md:mt-20">
          <Eyebrow className="ct-rise text-ink-soft">Stay tuned · something new for tutors</Eyebrow>
          <Display
            as="h1"
            className="ct-rise mt-6 whitespace-nowrap text-[clamp(2.4rem,8vw,6.5rem)] text-cocoa"
            style={{ animationDelay: "80ms" }}
          >
            Coming <Script className="text-sky-deep">soon</Script>
          </Display>
          <p
            className="ct-rise mt-8 max-w-[62ch] text-[clamp(1.15rem,2vw,1.4rem)] leading-relaxed text-ink-soft"
            style={{ animationDelay: "160ms" }}
          >
            BumbleNote turns your 1-to-1 English lessons into finished, personal
            feedback for every student. We&apos;re putting on the final touches — leave
            your email and you&apos;ll be the first to know when the doors open.
          </p>
          <div className="ct-rise mt-10 w-full max-w-[560px]" style={{ animationDelay: "240ms" }}>
            <WaitlistForm autoFocus={!error} cta="Notify me" />
          </div>
        </div>
      </section>

      {/* ---- what's coming ---- */}
      <section className="bg-cocoa px-5 py-24 text-butter sm:px-8">
        <div className="mx-auto w-full max-w-[1100px]">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="text-sky">What&apos;s on the way</Eyebrow>
            <Display className="mt-5 text-[clamp(2.4rem,6vw,4.4rem)]">
              Teach the lesson
              <Script block className="text-sky">
                we&apos;ll write
              </Script>
              the notes
            </Display>
          </div>

          <ol className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
            {coming.map((c) => (
              <li key={c.n} className="rounded-[28px] bg-butter/[.07] p-8 ring-1 ring-butter/15">
                <div className="font-display text-5xl leading-none text-sky">{c.n}</div>
                <h3 className="mt-6 text-[1rem] font-semibold uppercase tracking-[.14em]">
                  {c.title}
                </h3>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-butter/80">{c.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- second ask ---- */}
      <section className="bg-white px-5 py-24 sm:px-8">
        <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
          <Display className="text-[clamp(2.4rem,6vw,4.4rem)] text-cocoa">
            Be first
            <Script block className="text-sky-deep">
              in
            </Script>
            line
          </Display>
          <p className="mt-6 max-w-[42ch] text-lg text-ink-soft">
            One email on launch day, then you can try it on your own lessons.
          </p>
          <div className="mt-9 w-full max-w-[560px]">
            <WaitlistForm cta="Join the list" />
          </div>
        </div>
      </section>

      {/* ---- foot: early access ---- */}
      <footer className="bg-cocoa px-5 py-12 text-butter sm:px-8">
        <div className="mx-auto flex w-full max-w-[560px] flex-col items-center text-center">
          {/* The shared pre-launch password (src/lib/site-gate.ts). Opens by
              itself after a wrong attempt so the error is visible. */}
          <details
            open={!!error}
            className="group w-full [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 text-[.8rem] font-semibold uppercase tracking-[.16em] text-butter/75 transition-colors duration-200 hover:text-butter">
              Have an early-access password?
              <span className="transition-transform duration-300 group-open:rotate-180">▾</span>
            </summary>

            <form action={enterSite} className="mt-5">
              <input type="hidden" name="from" value={target} />
              <label className="block">
                <span className="sr-only">Access password</span>
                <div className="flex gap-2">
                  <input
                    type="password"
                    name="password"
                    required
                    autoFocus={!!error}
                    autoComplete="current-password"
                    placeholder="Access password"
                    aria-invalid={!!error}
                    aria-describedby={error ? "gate-error" : undefined}
                    className={`min-w-0 flex-1 rounded-full bg-butter/10 px-5 py-3 text-butter outline-none ring-1 transition-all duration-200 placeholder:text-butter/50 focus:ring-2 ${
                      error ? "ring-[#e77]" : "ring-butter/25 focus:ring-butter/60"
                    }`}
                  />
                  <button
                    type="submit"
                    className="flex-none rounded-full bg-butter px-6 py-3 text-[.85rem] font-semibold uppercase tracking-[.12em] text-cocoa transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
                  >
                    Enter
                  </button>
                </div>
                {error ? (
                  <span id="gate-error" className="mt-2 block text-sm text-[#ffb4a8]">
                    That password isn&apos;t right — check it and try again.
                  </span>
                ) : null}
              </label>
            </form>
          </details>

          <p className="mt-8 text-[.8rem] text-butter/55">
            © {new Date().getFullYear()} BumbleNote
          </p>
        </div>
      </footer>
    </div>
  );
}
