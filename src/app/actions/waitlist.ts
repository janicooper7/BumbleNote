"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { clientIp, rateLimit, waitText } from "@/lib/rate-limit";
import { META_SOURCE_ORIGIN, trackVisitorConversion } from "@/lib/meta-capi";
import { metaEventId } from "@/lib/tracking";
import { readRequestTracking } from "@/lib/tracking-server";
import { sendWaitlistWelcome } from "@/lib/waitlist-welcome";

export type WaitlistState =
  | { status: "idle" }
  /** `leadEventId`: set when the Pixel should send its copy of the Lead event. */
  | { status: "joined"; email: string; leadEventId?: string }
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

  // A person joins once; a few retries cover a typo'd address. Anything past
  // that is a script filling the list with junk (the honeypot only catches the
  // lazy ones). Checked after validation so a typo doesn't count.
  const limited = await rateLimit({
    key: `waitlist:ip:${clientIp(await headers())}`,
    limit: 10,
    windowSec: 60 * 60,
  });
  if (!limited.ok) {
    return {
      status: "error",
      message: `That's a lot of signups from here — try again in ${waitText(limited.retryAfterSec)}.`,
    };
  }

  let inserted: { id: string } | undefined;
  try {
    [inserted] = await db
      .insert(schema.waitlist)
      .values({ email })
      .onConflictDoNothing()
      .returning({ id: schema.waitlist.id });
  } catch (err) {
    console.error("[waitlist] insert failed", err);
    return { status: "error", message: "Something went wrong on our side. Please try again in a moment." };
  }

  // Only a new row gets the welcome email, so re-submitting the form can't be
  // used to send it again. A failed send doesn't fail the signup: the address is
  // saved, and scripts/send-waitlist-welcome.ts picks up anyone who missed it.
  if (inserted) {
    try {
      await sendWaitlistWelcome(inserted.id);
    } catch (err) {
      console.error("[waitlist] welcome email failed", err);
    }
    const leadEventId = await trackLead(inserted.id, email);
    if (leadEventId) return { status: "joined", email, leadEventId };
  }

  return { status: "joined", email };
}

/**
 * Meta's Lead for a new waitlist address (src/lib/meta-capi.ts): the server's
 * copy goes once the response is out, and the event id comes back for the
 * Pixel's copy, so Meta counts one. Only with marketing consent; a repeat
 * signup never gets here. Never throws.
 */
async function trackLead(waitlistId: string, email: string): Promise<string | null> {
  try {
    const t = await readRequestTracking();
    const eventId = metaEventId.lead(waitlistId);
    const send = () =>
      trackVisitorConversion({
        eventId,
        eventName: "Lead",
        consented: t.consent === "marketing",
        user: { email, ip: t.ip, userAgent: t.userAgent, fbp: t.fbp, fbc: t.fbc, country: t.country },
        eventSourceUrl: `${META_SOURCE_ORIGIN}/enter`,
      });
    after(send);
    return t.consent === "marketing" ? eventId : null;
  } catch (err) {
    console.error("[waitlist] couldn't track the lead:", err);
    return null;
  }
}
