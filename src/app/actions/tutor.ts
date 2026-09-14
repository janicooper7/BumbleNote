"use server";

// Server Actions for the tutor's own account (dashboard → Settings → Profile).
// Both are scoped to the signed-in tutor: the id comes from the session, never
// from the caller, so there is nothing here another tenant can address.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tutors } from "@/db/schema";
import { currentTutorId, signOut } from "@/auth";
import { cancelSubscriptionForDeletion } from "@/lib/billing";
import { MAX_NAME_LENGTH, normalizeTutorName } from "@/lib/tutor";

/**
 * Validation failures come back as values rather than thrown errors: Next
 * redacts thrown Server Action messages in production, so a throw would reach
 * the tutor as an anonymous "an error occurred" (same reasoning as
 * createStudent in ./students.ts).
 */
export type UpdateNameResult = { ok: true; name: string } | { ok: false; error: string };

export async function updateTutorName(input: string): Promise<UpdateNameResult> {
  const tutorId = await currentTutorId();
  const name = normalizeTutorName(input);

  if (!name) return { ok: false, error: "Your name can't be empty." };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Please keep your name under ${MAX_NAME_LENGTH} characters.` };
  }

  await db.update(tutors).set({ name }).where(eq(tutors.id, tutorId));

  // The sidebar and every greeting read the tutor row, so refresh the whole
  // dashboard subtree rather than just this page.
  revalidatePath("/dashboard", "layout");
  return { ok: true, name };
}

/**
 * Permanently delete the tutor's account. Students and sessions are removed by
 * the `on delete cascade` on their `tutor_id` foreign keys, so deleting the one
 * row takes the whole tenant with it.
 *
 * Signing in with the same Google account afterwards creates a fresh, empty
 * tutor (see the jwt callback in src/auth.ts) — it does not resurrect any of
 * this data.
 */
export async function deleteAccount(): Promise<void> {
  const tutorId = await currentTutorId();

  // Stop billing first. If Stripe is unreachable this throws and the account
  // stays — deleting the row would orphan a subscription that keeps charging a
  // card with no account behind it, and no way for the tutor to cancel it.
  await cancelSubscriptionForDeletion(tutorId);

  await db.delete(tutors).where(eq(tutors.id, tutorId));

  // Clear the cookie last: the JWT still carries the now-dangling tutorId, and
  // every dashboard query would throw on it. signOut() redirects, which throws a
  // control-flow exception — nothing after it runs.
  await signOut({ redirectTo: "/" });
}
