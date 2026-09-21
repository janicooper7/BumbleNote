import Reveal from "../Reveal";

// Extracted from the old Testimonials section when its placeholder quotes were
// removed (see git history for that component). Every claim here is one the
// product actually enforces in code — keep it that way.

export default function PrivacyBadge() {
  return (
    <section className="pb-10 pt-4">
      <div className="mx-auto w-full max-w-[1160px] px-8">
        <Reveal>
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border border-brand-line bg-brand-soft/50 px-6 py-4 text-center text-sm font-medium text-ink-soft">
            <span className="inline-flex items-center gap-2">
              <Shield /> Tutor confirms every note before it&apos;s sent
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Shield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-deep)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
