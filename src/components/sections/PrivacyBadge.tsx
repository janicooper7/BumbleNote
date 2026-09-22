import Reveal from "../Reveal";
import { Asterisk } from "../bn/Bn";

// Extracted from the old Testimonials section when its placeholder quotes were
// removed (see git history for that component). Every claim here is one the
// product actually enforces in code — keep it that way. Drawn as one of the
// pack's cocoa pills (14).

export default function PrivacyBadge() {
  return (
    <section className="bg-white pb-20">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal>
          <div className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-full bg-cocoa px-6 py-3.5 text-center text-[.8rem] font-semibold uppercase tracking-[.14em] text-butter sm:px-8">
            <Asterisk className="h-4 w-4 flex-none text-sky" />
            You confirm every note before it&apos;s sent
          </div>
        </Reveal>
      </div>
    </section>
  );
}
