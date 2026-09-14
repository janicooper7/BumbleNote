"use server";

import { db, schema } from "@/db";

export type WaitlistState =
  | { status: "idle" }
  | { status: "joined"; email: string }
  | { status: "error"; message: string };

// Deliberately loose — the only goal is to catch typos like a missing "@" or
// TLD. Anything stricter rejects real addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Add an address to the pre-launch waitlist from the /enter page.
 *
 * A repeat signup reports success just like a new one, so the form can't be used
 * to test whether someone is already on the list. The hidden `company` field is a
 * honeypot: people never see it, form-filling bots usually do, and a filled one
 * is quietly "accepted" without touching the database.
 */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (String(formData.get("company") ?? "") !== "") {
    return { status: "joined", email };
  }

  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { status: "error", message: "That doesn't look like an email address — check it and try again." };
  }

  try {
    await db.insert(schema.waitlist).values({ email }).onConflictDoNothing();
  } catch (err) {
    console.error("[waitlist] insert failed", err);
    return { status: "error", message: "Something went wrong on our side. Please try again in a moment." };
  }

  return { status: "joined", email };
}
