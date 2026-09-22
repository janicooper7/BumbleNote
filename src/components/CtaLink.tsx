import Link from "next/link";

// The one call-to-action link, drawn as the template pack's pills: a solid
// cocoa pill with butter capitals (template 14), its butter twin for cocoa
// backgrounds, and the thin outline pill (templates 8, 43).

type Props = {
  href: string;
  children: React.ReactNode;
  /** primary: cocoa pill · light: butter pill (on cocoa) · outline: thin ring in the current colour */
  variant?: "primary" | "light" | "outline" | "secondary";
  size?: "md" | "lg";
  /** Trailing → that nudges right on hover. */
  arrow?: boolean;
  className?: string;
};

const LOOK = {
  primary: "bg-cocoa text-butter hover:bg-cocoa-lift",
  light: "bg-butter text-cocoa hover:bg-white",
  outline: "border-[1.5px] border-current hover:bg-current/10",
};

export default function CtaLink({
  href,
  children,
  variant = "primary",
  size = "lg",
  arrow = false,
  className = "",
}: Props) {
  const pad = size === "lg" ? "px-8 py-4 text-[.95rem]" : "px-6 py-3 text-[.85rem]";
  const look = LOOK[variant === "secondary" ? "outline" : variant];
  const cls = `group inline-flex items-center justify-center gap-2.5 rounded-full font-semibold uppercase tracking-[.12em] transition-all duration-300 hover:-translate-y-0.5 ${pad} ${look} ${className}`;
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
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}
