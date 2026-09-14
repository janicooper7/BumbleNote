// Terms of Service acceptance. Server-only.
//
// Every tutor must have accepted the CURRENT version before using the dashboard.
// There are three ways in, and each one records acceptance differently:
//
//   Email signup     — the signup form requires the checkbox, and the row is
//                      inserted with the acceptance already on it.
//   Google signup    — the account row is created inside NextAuth's jwt callback,
//                      which can't see the form. So the signup page's action sets
//                      TERMS_COOKIE, and the dashboard layout turns that cookie
//                      into a recorded acceptance on the tutor's first page load.
//   Everyone else    — "Continue with Google" on the login page (which creates an
//                      account for a new email), tutors who predate this, and
//                      anyone after TERMS_VERSION is bumped: the layout sends them
//                      to /accept-terms.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tutors } from "@/db/schema";

/**
 * Bump to make every tutor re-accept — for material changes only. Cosmetic edits
 * to /terms shouldn't force a click-through on everyone.
 */
export const TERMS_VERSION = "2026-09-14";

export const TERMS_COOKIE = "bn_terms_accepted";

/** Long enough to survive a Google round-trip and a Stripe Checkout in between. */
export const TERMS_COOKIE_MAX_AGE = 2 * 60 * 60;

export function acceptedCurrentTerms(version: string | null | undefined): boolean {
  return version === TERMS_VERSION;
}

export async function recordTermsAcceptance(tutorId: string): Promise<void> {
  await db
    .update(tutors)
    .set({ termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION })
    .where(eq(tutors.id, tutorId));
}
