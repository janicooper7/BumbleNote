import type { SessionStatus } from "@/lib/mock";

// The three buckets a lesson moves through, in the order the tutor works them:
// drafts first (they need action), then confirmed-but-unsent, then done. Shared
// by the lessons page and the overview queue so both say the same thing. Kept
// out of the "use client" LessonSection module: a server page importing plain
// data from a client file gets a client reference, not the array.
export const LESSON_SECTIONS: { status: SessionStatus; title: string; hint: string; empty: string }[] = [
  {
    status: "draft",
    title: "Needs review",
    hint: "Feedback is drafted and waiting for you to check it.",
    empty: "Nothing to review — you're all caught up.",
  },
  {
    status: "confirmed",
    title: "Confirmed",
    hint: "Reviewed and ready — not sent to the student yet.",
    empty: "Nothing waiting to be sent.",
  },
  {
    status: "sent",
    title: "Completed",
    hint: "Sent to the student.",
    empty: "No lessons sent yet.",
  },
];
