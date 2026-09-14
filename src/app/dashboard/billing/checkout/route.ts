// GET /dashboard/billing/checkout?plan=pro&interval=year
//
// Sends the signed-in tutor to Stripe Checkout. A GET (not a Server Action) so
// the signup and login forms can hand it over as their post-auth redirect —
// that's how "Choose Pro" on the pricing page becomes account → checkout in one
// go. Nothing here is harmful to trigger cross-site: the worst case is an
// unpaid Checkout page the tutor closes.
//
// Signed-out requests never reach this: src/proxy.ts sends /dashboard/* to /login.

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { currentTutorId } from "@/auth";
import { appOrigin } from "@/lib/app-url";
import { checkoutUrl, isPaidPlanId } from "@/lib/billing";

export async function GET(req: NextRequest): Promise<never> {
  const tutorId = await currentTutorId();
  const plan = req.nextUrl.searchParams.get("plan");
  const interval = req.nextUrl.searchParams.get("interval") === "year" ? "year" : "month";

  if (!isPaidPlanId(plan)) redirect("/dashboard/settings");

  let url: string;
  try {
    url = await checkoutUrl(tutorId, plan, interval, await appOrigin());
  } catch (err) {
    console.error("stripe checkout failed", err);
    redirect("/dashboard/settings?billing=error");
  }
  redirect(url);
}
