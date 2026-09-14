// GET /dashboard/billing/portal — Stripe's hosted billing portal, where a paying
// tutor switches plan, updates their card, sees invoices, or cancels. Every
// change made there comes back through /api/stripe/webhook.

import { redirect } from "next/navigation";
import { currentTutorId } from "@/auth";
import { appOrigin } from "@/lib/app-url";
import { portalUrl } from "@/lib/billing";

export async function GET(): Promise<never> {
  const tutorId = await currentTutorId();

  let url: string;
  try {
    url = await portalUrl(tutorId, await appOrigin());
  } catch (err) {
    console.error("stripe portal failed", err);
    redirect("/dashboard/settings?billing=error");
  }
  redirect(url);
}
