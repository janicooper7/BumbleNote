// The check-in email's "what's in the way?" (email 7, src/lib/lifecycle-emails.ts).
// We don't take replies, so each answer is a link: clicking it opens a page
// with help for that answer (src/app/api/email/check-in) and records the
// answer on the tutor (tutors.stuck_reason). No DB here, so src/lib/email.ts
// can import the labels.

export const STUCK_REASONS = ["no-lesson", "how-to", "student-ok", "device", "other"] as const;
export type StuckReason = (typeof STUCK_REASONS)[number];

export function isStuckReason(s: string): s is StuckReason {
  return (STUCK_REASONS as readonly string[]).includes(s);
}

/** The link text in the email, in the tutor's voice. */
export const STUCK_LABEL: Record<StuckReason, string> = {
  "no-lesson": "I haven't had a lesson since I signed up",
  "how-to": "I'm not sure how recording works",
  "student-ok": "I need to ask my student first",
  device: "I teach on a phone or tablet",
  other: "Something else",
};

/**
 * The page each answer opens: a heading, a paragraph or two, and one link.
 * Plain strings; the route escapes them.
 */
export const STUCK_HELP: Record<StuckReason, { title: string; body: string[]; link: { href: string; label: string } }> = {
  "no-lesson": {
    title: "No rush at all",
    body: [
      "Your two free lessons will be waiting whenever your next lesson comes round.",
      "If you'd like to be ready for it, add your student now. Then on the day, you just click \"Record a lesson\".",
    ],
    link: { href: "/dashboard/students/new", label: "Add your first student" },
  },
  "how-to": {
    title: "Here's how recording works",
    body: [
      "Open your lesson in a tab in desktop Chrome or Edge, as you normally would. In BumbleNote, click \"Record a lesson\", pick your lesson tab when the browser asks, and tick \"Share tab audio\". Your own microphone is recorded too.",
      "When the lesson ends, click \"Stop & file lesson\". Your notes are written up for you to check before anything goes to your student.",
    ],
    link: { href: "/dashboard/guides/record-a-lesson", label: "Watch: Record a lesson" },
  },
  "student-ok": {
    title: "Asking first is exactly right",
    body: [
      "Something like this works well: \"I'd like to use a tool called BumbleNote to write up our lessons for you. It records the lesson's audio, which is deleted once the notes are made, and I check everything before it's sent to you. Is that OK with you?\"",
      "No bot joins your call. Recording happens in your own browser tab, and only when you press Record.",
    ],
    link: { href: "/privacy", label: "Read our privacy policy" },
  },
  device: {
    title: "BumbleNote records on a computer",
    body: [
      "Recording needs desktop Chrome or Edge, because that's where a browser can hear the lesson tab. Phones and tablets can't do that yet.",
      "If you have a laptop you sometimes teach on, sign in there and your account will be ready.",
    ],
    link: { href: "/dashboard", label: "Open BumbleNote" },
  },
  other: {
    title: "Thanks for telling us",
    body: [
      "We'd love to hear what's in the way. In BumbleNote, the \"Get in touch\" button sends a message straight to Millie and Jani.",
    ],
    link: { href: "/dashboard", label: "Open BumbleNote" },
  },
};
