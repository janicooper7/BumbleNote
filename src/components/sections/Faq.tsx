import Link from "next/link";
import Reveal from "../Reveal";
import { MIN_COUNTED_LESSON_MIN } from "@/lib/plans";

// The questions a tutor asks before they'll put a recorder in front of a
// student. Native <details>: keyboard and screen-reader behaviour for free, and
// it works before (or without) any client JS.
//
// Every answer restates something the product or the Terms already commits to —
// the recording flow is src/components/dashboard/useSessionRecorder.ts, the
// consent duty is Terms §"Recording other people", the lesson threshold is
// MIN_COUNTED_LESSON_MIN. Change those and change this.

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: "Which lessons does it work with?",
    a: (
      <>
        Any lesson that runs in a browser tab: Google Meet, Zoom or Teams on the web, and
        the browser classrooms on Preply, italki and Cambly. BumbleNote captures that
        tab&apos;s audio and your microphone, so use desktop Chrome or Edge. If you usually
        teach in the Zoom or Teams desktop app, open its web version for that lesson.
      </>
    ),
  },
  {
    q: "Do I need to install anything?",
    a: "No. Recording happens inside BumbleNote, in your browser — there's no extension or app to install, and no bot joins your call.",
  },
  {
    q: "How do I record a lesson?",
    a: "Open BumbleNote in one tab and your lesson in another. Hit Record, pick your student, and when your browser asks what to share, choose your lesson tab and tick “Share tab audio”. Keep the BumbleNote tab open while you teach, then press Stop & file lesson — closing it before the lesson is saved loses the recording.",
  },
  {
    q: "Do my students need to know they’re being recorded?",
    a: (
      <>
        Yes. The law on recording conversations differs by country, and in many places
        everyone taking part must agree in advance. You&apos;re responsible for getting your
        student&apos;s agreement before you record — see &ldquo;Recording other people&rdquo; in
        our{" "}
        <Link href="/terms#consent" className="font-semibold text-brand-deep underline-offset-4 hover:underline">
          Terms
        </Link>
        .
      </>
    ),
  },
  {
    q: "What counts as a lesson?",
    a: `A recording counts toward your plan once it runs ${MIN_COUNTED_LESSON_MIN} minutes or longer, so a call that drops early doesn't cost you a lesson. Short pieces can be combined afterwards into one lesson.`,
  },
  {
    q: "Can I use it for group classes?",
    a: "BumbleNote is built for 1-to-1 lessons, where it can keep you and your student apart.",
  },
  {
    q: "What does the free trial include?",
    a: "One student and two lessons in total, with no card required. Choose a plan when you want to keep going.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="py-24">
      <div className="mx-auto w-full max-w-3xl px-8">
        <Reveal className="mb-10 text-center">
          <div className="text-[.82rem] font-bold uppercase tracking-widest text-brand-deep">
            FAQ
          </div>
          <h2 className="mt-4 font-display text-[clamp(2rem,3.8vw,2.9rem)] font-medium tracking-tight">
            Questions before you start.
          </h2>
        </Reveal>

        <Reveal className="flex flex-col gap-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-[18px] border border-line bg-surface px-5 shadow-soft-sm open:border-brand-line"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-display text-lg font-medium text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand-soft text-brand-deep transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-5 text-[.98rem] leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
