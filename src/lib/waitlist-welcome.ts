// The waitlist welcome email: who gets it, exactly once, and how they leave the
// list. Server-only (DB).
//
// Sent from two places — joinWaitlist (src/app/actions/waitlist.ts) for each new
// signup, and scripts/send-waitlist-welcome.ts for everyone who joined before
// this existed. Both go through sendWaitlistWelcome, which claims the row before
// sending, so the two can't double up on one address.

import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendWaitlistWelcomeEmail } from "./email";

/** Links in the email have to work from any inbox, so they point at production. */
const PUBLIC_ORIGIN =
  process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://bumblenote.com";

/**
 * The unsubscribe link is keyed on the row id alone. That id is a random v4
 * UUID (122 bits, gen_random_uuid) that appears nowhere except this person's
 * own emails, so it can't be guessed to remove someone else. Deliberately not
 * signed with a server secret: the backfill script runs from a laptop, and its
 * links have to work on production whatever that machine's secrets are.
 */
export function unsubscribeUrl(id: string): string {
  return `${PUBLIC_ORIGIN}/api/waitlist/unsubscribe?${new URLSearchParams({ id })}`;
}

/** Take an address off the waitlist. Deleting (not flagging) is what the privacy policy promises on unsubscribe. */
export async function removeFromWaitlist(id: string): Promise<void> {
  await db.delete(schema.waitlist).where(eq(schema.waitlist.id, id));
}

/**
 * Send the welcome email to one waitlist row, unless it has already had it.
 * Returns whether this call sent it.
 *
 * The row is claimed first (welcome_sent_at set where it was null), so a signup
 * and the backfill script racing on the same row can't both send. If the send
 * fails the claim is released, so the next run picks the row up again.
 */
export async function sendWaitlistWelcome(id: string): Promise<boolean> {
  const [claimed] = await db
    .update(schema.waitlist)
    .set({ welcomeSentAt: new Date() })
    .where(and(eq(schema.waitlist.id, id), isNull(schema.waitlist.welcomeSentAt)))
    .returning({ email: schema.waitlist.email });
  if (!claimed) return false;

  try {
    await sendWaitlistWelcomeEmail({ to: claimed.email, unsubscribeUrl: unsubscribeUrl(id) });
  } catch (err) {
    await db
      .update(schema.waitlist)
      .set({ welcomeSentAt: null })
      .where(eq(schema.waitlist.id, id));
    throw err;
  }
  return true;
}
