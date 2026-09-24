// Paid plans, their USD prices and their Stripe price lookup keys.
//
// Deliberately import-free: the auth pages, the billing module and the
// scripts/stripe-setup.ts CLI (run under tsx, no path aliases) all read it.

export const PAID_PLAN_IDS = ["starter", "advanced", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export type BillingInterval = "month" | "year";

/**
 * src/components/sections/Pricing.tsx renders these directly (including the
 * "save $X a year" line, which is month × 12 − year). Annual is ten months' price
 * for twelve ("2 months free"). Stripe prices are immutable, so changing a
 * number here does nothing until scripts/stripe-setup.ts is re-run — it creates
 * a new price and moves the lookup key onto it. Existing subscribers stay on
 * their old price until moved.
 */
export const PLAN_PRICES_USD: Record<PaidPlanId, Record<BillingInterval, number>> = {
  starter: { month: 15.99, year: 159.9 },
  advanced: { month: 39.99, year: 399.9 },
  pro: { month: 59.99, year: 599.9 },
};

/** Whole cents, safe from float drift (15.99 * 100 is 1599.0000000000002). */
export function toCents(usd: number): number {
  return Math.round(usd * 100);
}

/** "15.99", "159.90", "19" — two decimals only when there are cents. */
export function formatUsd(usd: number): string {
  const cents = toCents(usd);
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** What a year on annual billing saves over twelve monthly payments. */
export function annualSavingUsd(plan: PaidPlanId): number {
  const p = PLAN_PRICES_USD[plan];
  return (toCents(p.month) * 12 - toCents(p.year)) / 100;
}

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
