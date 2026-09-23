"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import CtaLink from "./CtaLink";
import { useSignedIn } from "./SignedIn";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#feedback", label: "Sample recap" },
  { href: "#journey", label: "Progress" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

// White, like the page, so it runs straight into the hero. The cocoa hairline
// only appears once the page scrolls under it.
export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const signedIn = useSignedIn();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the menu; it also closes itself when a link is chosen.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-white text-cocoa transition-colors duration-300 ${
        scrolled || open ? "border-cocoa/15" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[78px] w-full max-w-[1200px] items-center justify-between px-5 sm:px-8">
        <a href="#" className="flex items-center gap-2.5">
          <Logo />
        </a>

        <nav
          aria-label="Main"
          className="hidden items-center gap-7 text-[.8rem] font-medium uppercase tracking-[.18em] text-ink-soft lg:flex xl:gap-9"
        >
          {links.map((l) => (
            <a key={l.href} href={l.href} className="group relative transition-colors hover:text-cocoa">
              {l.label}
              <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-cocoa transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          {signedIn ? (
            <CtaLink href="/dashboard" size="md" arrow>
              Dashboard
            </CtaLink>
          ) : (
            <>
              <CtaLink href="/login" size="md" variant="outline" className="hidden sm:inline-flex">
                Log in
              </CtaLink>
              <CtaLink href="/signup" size="md">
                Start free
              </CtaLink>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-11 w-11 place-items-center rounded-full border border-cocoa/30 text-cocoa lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-cocoa/15 bg-white px-5 pb-6 pt-2 sm:px-8 lg:hidden">
          <ul className="mx-auto flex max-w-[1200px] flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-cocoa/15 py-4 font-display text-xl uppercase tracking-wide text-cocoa"
                >
                  {l.label}
                </a>
              </li>
            ))}
            {/* The header itself only has room for "Log in" from sm up. */}
            {!signedIn && (
              <li className="sm:hidden">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block py-4 font-display text-xl uppercase tracking-wide text-cocoa"
                >
                  Log in
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
