// GET /dashboard/billing/success?session_id=cs_…
//
// Where Stripe Checkout returns the tutor after paying. The webhook will update
// their plan too, but it can land a few seconds after the redirect — long
// enough for the tutor to see "Free" on the page they were just told they'd
// upgraded on. So the plan is synced here as well; syncSubscription() is
// idempotent, so whichever runs second is a no-op.

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { currentTutorId } from "@/auth";
import { stripe, syncSubscription } from "@/lib/billing";

export async function GET(req: NextRequest): Promise<never> {
  const tutorId = await currentTutorId();
  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
  if (!sessionId.startsWith("cs_")) redirect("/dashboard/settings");

  let outcome = "success";
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    // The session id is in the URL, so check it belongs to whoever is signed in
    // — otherwise anyone could sync (harmlessly, but still) someone else's.
    if (session.client_reference_id !== tutorId) {
      outcome = "error";
    } else if (typeof session.subscription === "string") {
      await syncSubscription(session.subscription);
    } else if (session.subscription) {
      await syncSubscription(session.subscription.id);
    }
  } catch (err) {
    // Payment went through on Stripe's side; only our read failed. The webhook
    // will still set the plan, so tell the tutor it's on its way, not that it failed.
    console.error("stripe checkout return sync failed", err);
    outcome = "pending";
  }
  redirect(`/dashboard/settings?billing=${outcome}`);
}
