// Building blocks of the template-pack look ("Bumble note - social media
// templates"). Template numbers in the comments point at the JPG each piece is
// taken from.

/* ── type ─────────────────────────────────────────────────────────────── */

/** Small spaced capitals above or below a headline — "GET READY", "STAY TUNED" (2, 12). */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[.8rem] font-medium uppercase tracking-[.22em] ${className}`}>{children}</div>
  );
}

/**
 * The pack's signature headline: display-serif capitals with one script word
 * laid over them ("COMING *soon*", "LOVE *letters* FROM CLIENTS" — 2, 12, 28).
 * Put <Script> inside for the overlapping word.
 */
export function Display({
  as: Tag = "h2",
  children,
  className = "",
  style,
}: {
  as?: "h1" | "h2" | "h3";
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Tag className={`font-display uppercase leading-[.98] tracking-[.01em] ${className}`} style={style}>
      {children}
    </Tag>
  );
}

/**
 * The script word. `block` drops it onto its own line and pulls the lines
 * around it in, so it sits across them as in "SOMETHING *etheral* IS COMING".
 */
export function Script({
  children,
  block = false,
  className = "",
}: {
  children: React.ReactNode;
  block?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`font-script normal-case tracking-normal ${
        block ? "relative z-10 -my-[.18em] block text-[1.18em] leading-[1.1]" : "px-[.08em] text-[1.22em] leading-none"
      } ${className}`}
    >
      {children}
    </span>
  );
}

/* ── ornaments ────────────────────────────────────────────────────────── */

/** Eight-petal asterisk used as a bullet and a scatter ornament (21, 30, 31). */
export function Asterisk({ className = "", title }: { className?: string; title?: string }) {
  const petal = "M50 50Q58.5 27 50 3Q41.5 27 50 50Z";
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={petal} fill="currentColor" transform={`rotate(${i * 45} 50 50)`} />
      ))}
    </svg>
  );
}

/** Four-point sparkle (37, 7). */
export function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M50 0C54 36 64 46 100 50 64 54 54 64 50 100 46 64 36 54 0 50 36 46 46 36 50 0Z" fill="currentColor" />
    </svg>
  );
}

/** A hand-drawn looping arrow, as between the polaroids on 45. */
export function LoopArrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" className={className} aria-hidden>
      <path
        d="M6 20C30 4 70 2 88 22c12 13 2 30-12 26-13-4-9-24 8-26 14-2 26 8 30 26"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="m104 40 10 10 4-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
