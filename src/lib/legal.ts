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
  lastUpdated: "23 September 2026",

  /**
   * The same date, machine-readable, for the sitemap's <lastmod>. Kept next to
   * the display string above because the two must always name the same day —
   * change one and change the other.
   */
  lastUpdatedISO: "2026-09-23",

  /**
   * Retention window for lesson audio that a failed or abandoned upload leaves
   * behind. MUST match AUDIO_RETENTION_MS in src/lib/upload-store.ts — the sweep
   * in src/lib/upload-retention.ts is what makes this sentence true.
   */
  audioRetentionDays: 7,

  /** Days files attached to a lesson report are kept. Enforced by the same sweep. */
  attachmentRetentionDays: ATTACHMENT_RETENTION_DAYS,

  /**
   * How long deleted rows can survive in the database's point-in-time restore
   * history. Must be >= the history retention configured on the Neon project —
   * check it there before lowering this.
   */
  backupRetentionDays: 30,

  /** Notice we give before adding or replacing a provider that handles student data. */
  subprocessorNoticeDays: 30,
} as const;

/**
 * Third parties that process personal data on BumbleNote's behalf. Listed on the
 * privacy page because UK GDPR Art. 13 requires naming the categories of
 * recipient, and because a tutor deciding whether to record a lesson deserves to
 * know exactly whose infrastructure their student's voice passes through.
 */
export const SUBPROCESSORS: {
  name: string;
  role: string;
  data: string;
  /** Where the data is processed — UK GDPR Art. 13(1)(f) wants transfers named. */
  location: string;
}[] = [
  {
    name: "Netlify",
    role: "Hosting and temporary file storage",
    data: "Everything served by the site, plus lesson audio while it waits to be processed.",
    location: "United States, with a global delivery network",
  },
  {
    name: "Neon",
    role: "Database hosting",
    data: "Tutor accounts, student profiles, lesson notes, and launch waitlist email addresses.",
    // Verified from the connection host (eu-west-2). Update if the project moves.
    location: "United Kingdom (London)",
  },
  {
    name: "Deepgram",
    role: "Speech-to-text",
    // mip_opt_out in src/lib/stt.ts is what keeps this audio out of training.
    data: "Lesson audio, converted to a transcript. Opted out of Deepgram's model-improvement programme, so it is not used to train their models.",
    location: "United States",
  },
  {
    name: "Anthropic",
    role: "Lesson analysis",
    data: "The lesson transcript and the student profile fields that inform the feedback. Kept by Anthropic only briefly for abuse monitoring under its commercial terms, and never used for training.",
    location: "United States",
  },
  {
    name: "Resend",
    role: "Email delivery",
    data: "The student's name and email address, and the lesson report attached to the message. Waitlist email addresses, when we send the launch announcement.",
    location: "United States",
  },
  {
    name: "Stripe",
    role: "Payments",
    data: "The tutor's name, email address, billing address and payment details, for paid plans. Stripe keeps payment and invoice records for as long as tax and anti-fraud law requires.",
    location: "United States",
  },
  {
    name: "Google",
    role: "Sign-in",
    data: "The tutor's name and email address, when they choose to sign in with Google.",
    location: "United States",
  },
];
