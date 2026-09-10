// Shared shell for the whole-page dead ends: 404 and the error boundaries.
//
// These are the only screens a visitor reaches by accident, so they get the same
// care as the marketing pages — brand mark, a heading that says what happened in
// plain words, and at least one way out. No stack traces and no error codes the
// reader can't act on; the digest is the one exception, because it's the only
// thing that lets us find their failure in the logs when they quote it.

import Link from "next/link";
import Logo from "@/components/Logo";

export default function StatusPage({
  eyebrow,
  title,
  body,
  digest,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  digest?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-8 py-20 text-center">
      <Link href="/" aria-label="BumbleNote home">
        <Logo height={52} />
      </Link>

      <p className="mt-14 text-[.82rem] font-semibold uppercase tracking-[.14em] text-brand-deep">
        {eyebrow}
      </p>
      <h1 className="mt-4 font-display text-[2.1rem] leading-[1.15] text-ink sm:text-[2.6rem]">
        {title}
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-ink-soft">{body}</p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        {children}
      </div>

      {digest && (
        <p className="mt-10 text-[.8rem] text-muted">
          Reference <code className="font-mono text-ink-soft">{digest}</code> — quote
          it if you get in touch and we can find what went wrong.
        </p>
      )}
    </main>
  );
}

/** Filled honey button — the primary way out of a dead end. */
export function StatusPrimary({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const className =
    "rounded-xl bg-brand px-6 py-3 font-semibold text-ink shadow-soft-sm transition-all duration-200 hover:bg-brand-lit";
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

/** Quiet outlined button for the secondary route out. */
export function StatusSecondary({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const className =
    "rounded-xl border border-brand-line px-6 py-3 font-semibold text-ink-soft transition-colors duration-200 hover:border-brand hover:text-ink";
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
