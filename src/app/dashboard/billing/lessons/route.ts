// GET /dashboard/billing/lessons?pack=20
//
// Sends the signed-in subscriber to Stripe Checkout for a one-off pack of extra
// lessons (src/lib/lesson-packs.ts). A GET for the same reason as the plan
// checkout route next door: a plain link from Settings, and the worst a
// cross-site trigger can do is open a Checkout page nobody pays.

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { currentTutorId } from "@/auth";
import { appOrigin } from "@/lib/app-url";
import { refreshAdConsent } from "@/lib/tracking-server";
import { lessonPackCheckoutUrl } from "@/lib/billing";
import { lessonPackFor } from "@/lib/pricing";

export async function GET(req: NextRequest): Promise<never> {
  const tutorId = await currentTutorId();
  const pack = lessonPackFor(req.nextUrl.searchParams.get("pack"));
  if (!pack) redirect("/dashboard/settings");

  // The Subscribe/Purchase event the webhook sends uses the consent seen here.
  await refreshAdConsent(tutorId);

  let url: string;
  try {
    url = await lessonPackCheckoutUrl(tutorId, pack.lessons, await appOrigin());
  } catch (err) {
    console.error("stripe lesson pack checkout failed", err);
    redirect("/dashboard/settings?billing=error");
  }
  redirect(url);
}
