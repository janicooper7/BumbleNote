// Reads the plan a visitor picked on the pricing page out of the /signup or
// /login query string (?plan=pro&billing=annual). Kept free of Stripe and the
// database so the auth pages don't pull either in just to read a URL.

import { planFor } from "@/lib/plans";
import { isPaidPlanId } from "@/lib/pricing";

export type ResolvedPlanIntent = {
  plan?: string;
  billing?: string;
  /** Display name, for the page subheading. */
  planName?: string;
  /** "?plan=…&billing=…" to keep the choice on the signup ⇄ login links, or "". */
  query: string;
};

export function planIntentFrom(
  params: Record<string, string | string[] | undefined>,
): ResolvedPlanIntent {
  const plan = typeof params.plan === "string" ? params.plan : undefined;
  if (!isPaidPlanId(plan)) return { query: "" };
  const billing = params.billing === "annual" ? "annual" : undefined;
  return {
    plan,
    billing,
    planName: planFor(plan).name,
    query: `?plan=${plan}${billing ? "&billing=annual" : ""}`,
  };
}
