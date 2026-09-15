// Single source of truth for the facts the legal pages assert.
//
// These strings are legal commitments, not copy — they are the answer when a
// tutor, a student, or the ICO asks who is responsible and how to reach them.
// Keep them in one place so /terms and /privacy can never disagree.

import { ATTACHMENT_RETENTION_DAYS } from "./attachments";

export const LEGAL = {
  /**
   * The sole trader operating BumbleNote. A UK sole trader contracts under their
   * own legal name, so this must be the operator's full name as it would appear
   * on a contract — the trading name alone is not enough to identify a data
   * controller under UK GDPR Art. 13.
   *
   * If BumbleNote ever incorporates, this becomes the company name and both
   * pages need their "a sole trader based in the United Kingdom" wording
   * changed to name the registrar and company number alongside it.
   */
  operator: "Dzhani Cooper",

  /** Trading name — what the product is called. */
  tradingName: "BumbleNote",

  /** Where privacy requests, complaints, and support all land. */
  contactEmail: "johnycooper2301@gmail.com",

  /**
   * A sole trader isn't required to publish a home address, but must supply one
   * on request — which is what both pages say. If BumbleNote ever gets a business
   * address, put it here and cite it directly instead.
   */
  addressNote: "A postal address is available on request by email.",

  /** Shown at the top of both documents, and cited in the change clauses. */
  lastUpdated: "14 September 2026",

  /**
   * The same date, machine-readable, for the sitemap's <lastmod>. Kept next to
   * the display string above because the two must always name the same day —
   * change one and change the other.
   */
  lastUpdatedISO: "2026-09-14",

  /**
   * Retention window for lesson audio that a failed or abandoned upload leaves
   * behind. MUST match AUDIO_RETENTION_MS in src/lib/upload-store.ts — the sweep
   * in src/lib/upload-retention.ts is what makes this sentence true.
   */
  audioRetentionDays: 7,

  /** Days files attached to a lesson report are kept. Enforced by the same sweep. */
  attachmentRetentionDays: ATTACHMENT_RETENTION_DAYS,
} as const;

/**
 * Third parties that process personal data on BumbleNote's behalf. Listed on the
 * privacy page because UK GDPR Art. 13 requires naming the categories of
 * recipient, and because a tutor deciding whether to record a lesson deserves to
 * know exactly whose infrastructure their student's voice passes through.
 */
export const SUBPROCESSORS: { name: string; role: string; data: string }[] = [
  {
    name: "Netlify",
    role: "Hosting and temporary file storage",
    data: "Everything served by the site, plus lesson audio while it waits to be processed.",
  },
  {
    name: "Neon",
    role: "Database hosting",
    data: "Tutor accounts, student profiles, lesson notes, and launch waitlist email addresses.",
  },
  {
    name: "Deepgram",
    role: "Speech-to-text",
    data: "Lesson audio, converted to a transcript and then discarded.",
  },
  {
    name: "Anthropic",
    role: "Lesson analysis",
    data: "The lesson transcript and the student profile fields that inform the feedback.",
  },
  {
    name: "Resend",
    role: "Email delivery",
    data: "The student's name and email address, and the lesson report attached to the message. Waitlist email addresses, when we send the launch announcement.",
  },
  {
    name: "Stripe",
    role: "Payments",
    data: "The tutor's name, email address, billing address and payment details, for paid plans.",
  },
  {
    name: "Google",
    role: "Sign-in",
    data: "The tutor's name and email address, when they choose to sign in with Google.",
  },
];
