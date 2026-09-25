import Link from "next/link";
import Logo from "../Logo";
import { Asterisk, Display, Eyebrow, Script, Sparkle } from "../bn/Bn";
import { bnFontVars } from "../bn/fonts";

// The auth pages (log in, sign up, forgot / reset, accept terms) in the
// homepage's template-pack look: a cocoa panel with butter capitals and a
// script word across them, and a white form side with the same pills as the
// waitlist form. .theme-bn re-reads the shared tokens, so the forms inside can
// keep using ink / muted / brand-* and land on the pack palette.

const bullets = [
  "Feedback drafted after every lesson",
  "Student & tutor notes, ready to send",
  "A living progress journey per student",
];

export default function AuthLayout({
  children,
  heading,
  sub,
  eyebrow,
}: {
  children: React.ReactNode;
  /** May carry a <Script> word, as the homepage headlines do. */
  heading: React.ReactNode;
  sub: string;
  eyebrow?: string;
}) {
  return (
    <div
      className={`theme-bn ${bnFontVars} grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[1.05fr_1fr]`}
    >
      {/* brand panel */}
      <aside className="relative hidden overflow-hidden bg-cocoa p-12 text-butter lg:flex lg:flex-col lg:justify-between xl:p-16">
        <Asterisk className="pointer-events-none absolute right-[12%] top-[16%] h-10 w-10 text-sky" />
        <Sparkle className="pointer-events-none absolute bottom-[34%] right-[8%] h-7 w-7 text-butter/70" />
        <Asterisk className="pointer-events-none absolute left-[46%] top-[8%] h-5 w-5 text-butter/40" />

        <Link href="/" className="relative flex w-fit items-center">
          <Logo tone="light" />
        </Link>

        <div className="relative max-w-md">
          <Eyebrow className="text-sky">For 1-to-1 English tutors</Eyebrow>
          <Display className="mt-5 text-[clamp(2.4rem,3.6vw,3.4rem)]">
            Teach the lesson
            <Script block className="text-sky-deep">
              we&apos;ll write
            </Script>
            the notes
          </Display>
          <ul className="mt-10 flex flex-col gap-4">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-3 text-[1.02rem] text-butter/85">
                <Asterisk className="h-4 w-4 flex-none text-sky" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        <figure className="relative rounded-[28px] bg-butter/[.07] p-6 ring-1 ring-butter/15">
          <blockquote className="font-display text-[1.15rem] leading-snug text-butter">
            &ldquo;It gives my students better feedback than I had time to write — and I get
            my evenings back.&rdquo;
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-sky font-display text-lg text-cocoa">
              J
            </span>
            <div className="text-[.9rem]">
              <div className="font-semibold uppercase tracking-[.12em] text-butter">Jamie R.</div>
              <div className="text-butter/65">English tutor · 40 students</div>
            </div>
          </figcaption>
        </figure>
      </aside>

      {/* form side */}
      <main className="relative flex items-center justify-center overflow-hidden px-5 py-14 sm:px-10">
        <Asterisk className="pointer-events-none absolute right-[8%] top-[9%] hidden h-7 w-7 text-sky sm:block" />
        <Sparkle className="pointer-events-none absolute bottom-[8%] left-[7%] hidden h-6 w-6 text-cocoa/70 sm:block" />

        <div className="relative w-full max-w-[440px]">
          {/* compact logo for mobile */}
          <Link href="/" className="mb-10 flex w-fit items-center lg:hidden">
            <Logo />
          </Link>

          {eyebrow ? <Eyebrow className="mb-4 text-ink-soft">{eyebrow}</Eyebrow> : null}
          <Display as="h1" className="text-[clamp(2.1rem,5vw,2.9rem)] text-cocoa">
            {heading}
          </Display>
          <p className="mt-4 text-[1.05rem] text-ink-soft">{sub}</p>

          <div className="mt-9">{children}</div>
        </div>
      </main>
    </div>
  );
}
