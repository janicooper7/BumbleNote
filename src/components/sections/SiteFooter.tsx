import Link from "next/link";
import Logo from "../Logo";
import { LEGAL } from "@/lib/legal";

const LINK = "transition-colors hover:text-cocoa";

export default function SiteFooter() {
  return (
    <footer className="border-t border-cocoa/10 bg-white text-ink-soft">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-6 px-5 py-14 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
        </Link>
        {/* Section links are absolute (`/#how`) rather than bare fragments so the
            footer still works if it is ever rendered outside the landing page. */}
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-[.76rem] font-medium uppercase tracking-[.18em]">
          <Link href="/#how" className={LINK}>How it works</Link>
          <Link href="/#pricing" className={LINK}>Pricing</Link>
          <Link href="/#faq" className={LINK}>FAQ</Link>
          <Link href="/login" className={LINK}>Log in</Link>
          <Link href="/terms" className={LINK}>Terms</Link>
          <Link href="/privacy" className={LINK}>Privacy</Link>
          <a href={`mailto:${LEGAL.contactEmail}`} className={LINK}>
            Contact
          </a>
        </div>
        <div className="flex flex-col gap-1 text-[.76rem] uppercase tracking-[.18em] md:items-end">
          <span>© 2026 {LEGAL.tradingName}</span>
          <span>
            Maintained by{" "}
            <a href="https://aiwebhouse.com" target="_blank" rel="noopener" className={`underline underline-offset-4 ${LINK}`}>
              AiWebHouse
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
