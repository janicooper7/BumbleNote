import Link from "next/link";

// The one call-to-action link. The header, hero, pricing cards and closing band
// all used to carry their own copy of this class string and its inline shadow.

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  /** Trailing → that nudges right on hover. */
  arrow?: boolean;
  className?: string;
};

const GLOW = "0 10px 24px -10px rgba(210,140,0,.6)";

export default function CtaLink({
  href,
  children,
  variant = "primary",
  size = "lg",
  arrow = false,
  className = "",
}: Props) {
  const pad = size === "lg" ? "px-7 py-3.5" : "px-6 py-3";
  const look =
    variant === "primary"
      ? "bg-brand text-ink"
      : "border border-brand-line bg-white/60 text-ink backdrop-blur hover:border-brand";
  const cls = `group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 hover:-translate-y-0.5 ${pad} ${look} ${className}`;
  const style = variant === "primary" ? { boxShadow: GLOW } : undefined;
  const inner = (
    <>
      {children}
      {arrow && (
        <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      )}
    </>
  );

  // In-page anchors stay plain <a>: the browser's own smooth scroll respects the
  // header offset in globals.css, and there's no route to prefetch.
  if (href.startsWith("#")) {
    return (
      <a href={href} className={cls} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} style={style}>
      {inner}
    </Link>
  );
}
