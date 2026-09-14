// Paid plans, their USD prices and their Stripe price lookup keys.
//
// Deliberately import-free: the auth pages, the billing module and the
// scripts/stripe-setup.ts CLI (run under tsx, no path aliases) all read it.

export const PAID_PLAN_IDS = ["starter", "advanced", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export type BillingInterval = "month" | "year";

/**
 * Must match src/components/sections/Pricing.tsx. Annual is ten months' price
 * for twelve ("2 months free"). Stripe prices are immutable, so changing a
 * number here does nothing until scripts/stripe-setup.ts is re-run — it creates
 * a new price and moves the lookup key onto it. Existing subscribers stay on
 * their old price until moved.
 */
export const PLAN_PRICES_USD: Record<PaidPlanId, Record<BillingInterval, number>> = {
  starter: { month: 19, year: 190 },
  advanced: { month: 45, year: 450 },
  pro: { month: 79, year: 790 },
};

/** Name of the Stripe customer-portal configuration scripts/stripe-setup.ts maintains. */
export const PORTAL_CONFIG_NAME = "BumbleNote";

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Prices are looked up by key rather than id, so test mode and live mode need no
 * per-environment configuration — only the API key differs.
 */
export function priceLookupKey(plan: PaidPlanId, interval: BillingInterval): string {
  return `bumblenote_${plan}_${interval}`;
}

export function parseLookupKey(
  key: string | null | undefined,
): { plan: PaidPlanId; interval: BillingInterval } | null {
  const m = /^bumblenote_([a-z]+)_(month|year)$/.exec(key ?? "");
  if (!m || !isPaidPlanId(m[1])) return null;
  return { plan: m[1], interval: m[2] as BillingInterval };
}
