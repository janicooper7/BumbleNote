import Link from "next/link";
import Reveal from "../Reveal";
import { Display, Eyebrow, Script } from "../bn/Bn";
import { FAQS, type FaqEntry } from "@/lib/faq";

// The questions a tutor asks before they'll put a recorder in front of a
// student. The answers live in src/lib/faq.ts, shared with the structured data
// and /llms.txt. Native <details>: keyboard and screen-reader behaviour for
// free, and it works before (or without) any client JS.

/** The answer, with its `link` label (if any) turned into a real link. */
function Answer({ f }: { f: FaqEntry }) {
  if (!f.link) return <>{f.a}</>;
  const at = f.a.lastIndexOf(f.link.label);
  if (at < 0) return <>{f.a}</>;
  return (
    <>
      {f.a.slice(0, at)}
      <Link href={f.link.href} className="font-semibold text-cocoa underline underline-offset-4">
        {f.link.label}
      </Link>
      {f.a.slice(at + f.link.label.length)}
    </>
  );
}

// Template 40 ("FAQS"): the answers as soft butter note cards; an open card
// turns powder blue.
export default function Faq() {
  return (
    <section id="faq" className="bg-white py-24">
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <Reveal className="mb-12 text-center">
          <Eyebrow className="text-ink-soft">FAQ</Eyebrow>
          <Display className="mt-5 text-[clamp(2.3rem,5vw,3.8rem)] text-cocoa">
            Questions
            <Script block className="text-sky-deep">
              before you
            </Script>
            start
          </Display>
        </Reveal>

        <Reveal className="flex flex-col gap-3.5">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-[22px] bg-butter-soft px-6 transition-colors duration-300 open:bg-sky"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-display text-[1.3rem] leading-snug text-cocoa [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="grid h-8 w-8 flex-none place-items-center rounded-full bg-cocoa text-lg text-butter transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-6 text-[1rem] leading-relaxed text-ink-soft">
                <Answer f={f} />
              </p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
