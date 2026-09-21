"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import CtaLink from "./CtaLink";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#feedback", label: "Sample recap" },
  { href: "#journey", label: "Student progress" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

type SiteHeaderUser = {
  name?: string | null;
  email?: string | null;
};

export default function SiteHeader({ user }: { user?: SiteHeaderUser | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const signedIn = !!user;

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
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled || open
          ? "border-line bg-bg/90 backdrop-blur-md backdrop-saturate-150"
          : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[78px] w-full max-w-[1160px] items-center justify-between px-8">
        <a href="#" className="flex items-center gap-2.5">
          <Logo />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-8 font-medium text-ink-soft lg:flex xl:gap-10">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative transition-colors hover:text-ink"
            >
              {l.label}
              <span className="absolute -bottom-1.5 left-0 h-0.5 w-0 rounded-full bg-brand transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-5">
          {signedIn ? (
            <CtaLink href="/dashboard" size="md" arrow>
              Dashboard
            </CtaLink>
          ) : (
            <>
              <Link href="/login" className="hidden font-semibold text-ink-soft transition-colors hover:text-ink sm:block">
                Log in
              </Link>
              <CtaLink href="/signup" size="md" arrow>
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
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white/60 text-ink lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-line bg-bg/95 px-8 pb-6 pt-3 shadow-soft-md backdrop-blur-md lg:hidden"
        >
          <ul className="mx-auto flex max-w-[1160px] flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-line py-3.5 text-lg font-medium text-ink"
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
                  className="block py-3.5 text-lg font-semibold text-ink"
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
