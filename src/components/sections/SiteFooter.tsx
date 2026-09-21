import Link from "next/link";
import Logo from "../Logo";
import { LEGAL } from "@/lib/legal";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line py-14 text-muted">
      <div className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-5 px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
        </Link>
        {/* Section links are absolute (`/#how`) rather than bare fragments so the
            footer still works if it is ever rendered outside the landing page. */}
        <div className="flex flex-wrap gap-6 text-[.95rem]">
          <Link href="/#how" className="transition-colors hover:text-ink">How it works</Link>
          <Link href="/#pricing" className="transition-colors hover:text-ink">Pricing</Link>
          <Link href="/#faq" className="transition-colors hover:text-ink">FAQ</Link>
          <Link href="/login" className="transition-colors hover:text-ink">Log in</Link>
          <Link href="/terms" className="transition-colors hover:text-ink">Terms</Link>
          <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
          <a href={`mailto:${LEGAL.contactEmail}`} className="transition-colors hover:text-ink">
            Contact
          </a>
        </div>
        <div className="text-[.9rem]">© 2026 {LEGAL.tradingName}</div>
      </div>
    </footer>
  );
}
