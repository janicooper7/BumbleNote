// The homepage FAQ, as plain text.
//
// Three readers: the FAQ section on the page (src/components/sections/Faq.tsx),
// the FAQPage structured data (src/lib/structured-data.ts) and /llms.txt. Keeping
// the answers as strings in one place means the markup crawlers and AI search
// read can't drift from what a visitor sees.
//
// Every answer restates something the product or the Terms already commits to —
// the recording flow is src/components/dashboard/useSessionRecorder.ts, the
// consent duty is Terms §"Recording other people", the lesson threshold is
// MIN_COUNTED_LESSON_MIN. Change those and change this.

import { MIN_COUNTED_LESSON_MIN } from "./plans";

export type FaqEntry = {
  q: string;
  a: string;
  /** Rendered as a link on the page where `label` appears in the answer. */
  link?: { label: string; href: string };
};

export const FAQS: FaqEntry[] = [
  {
    q: "Which lessons does it work with?",
    a: "Any lesson that runs in a browser tab: Google Meet, Zoom or Teams on the web, and the browser classrooms on Preply, italki and Cambly. BumbleNote captures that tab's audio and your microphone, so use desktop Chrome or Edge. If you usually teach in the Zoom or Teams desktop app, open its web version for that lesson.",
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
    a: "Yes. The law on recording conversations differs by country, and in many places everyone taking part must agree in advance. You're responsible for getting your student's agreement before you record — see “Recording other people” in our Terms.",
    link: { label: "Terms", href: "/terms#consent" },
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
