// Shared shell for /terms and /privacy.
//
// Legal text is read under duress — someone is mid-signup, or has a specific
// worry and wants the one paragraph that answers it. So this leans harder on
// scannability than the marketing sections do: a narrow measure, generous space
// between clauses, and headings that say what the section answers rather than
// naming a legal concept.

import Link from "next/link";
import Logo from "@/components/Logo";
import { LEGAL } from "@/lib/legal";

export function LegalShell({
  title,
  intro,
  children,
  contactBox = true,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
  /** The closing "Questions about any of this?" box. Privacy must name a contact; Terms doesn't show it. */
  contactBox?: boolean;
}) {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-[78px] w-full max-w-[1160px] items-center justify-between px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
          </Link>
          <Link
            href="/"
            className="font-semibold text-ink-soft transition-colors hover:text-ink"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-8 py-16 sm:py-20">
        <p className="text-[.82rem] font-semibold uppercase tracking-[.14em] text-brand-deep">
          Last updated {LEGAL.lastUpdated}
        </p>
        <h1 className="mt-4 font-display text-[2.4rem] leading-[1.15] text-ink sm:text-[3rem]">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ink-soft">{intro}</p>

        <div className="mt-14 space-y-12">{children}</div>

        {contactBox && (
        <div className="mt-16 rounded-2xl border border-brand-line bg-brand-soft/50 p-7">
          <div className="font-semibold text-ink">Questions about any of this?</div>
          <p className="mt-2 text-ink-soft">
            Email{" "}
            <a
              href={`mailto:${LEGAL.contactEmail}`}
              className="font-semibold text-brand-deep hover:underline"
            >
              {LEGAL.contactEmail}
            </a>{" "}
            and a real person will answer. {LEGAL.addressNote}
          </p>
        </div>
        )}
      </main>

      <footer className="border-t border-line py-10 text-muted">
        <div className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-4 px-8 text-[.9rem]">
          <div>© 2026 {LEGAL.tradingName}</div>
          <div className="flex gap-6">
            <Link href="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}

/** One numbered clause. The id gives every section a linkable anchor. */
export function Clause({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-[1.55rem] leading-snug text-ink">{heading}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-brand-deep hover:[&_a]:underline [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

/** A bulleted list inside a clause. */
export function Points({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[.6em] size-1.5 flex-none rounded-full bg-brand" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A clause that matters more than the ones around it — the recording-consent
 * duty, the "check the AI's work" duty. Boxed so it survives skim-reading, which
 * is the only way most people read this page.
 */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-l-[3px] border-brand bg-brand-soft/40 px-5 py-4 text-ink">
      {children}
    </div>
  );
}
