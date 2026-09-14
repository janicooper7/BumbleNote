// Stripe billing. Server-only.
//
// THE SHAPE OF IT:
//
//   Checkout    — /dashboard/billing/checkout sends a tutor to Stripe's hosted
//                 page for one plan + interval.
//   Portal      — /dashboard/billing/portal sends a paying tutor to Stripe's
//                 hosted portal to switch plan, update the card, or cancel.
//   Sync        — syncSubscription() is the ONLY code that writes `tutors.plan`
//                 from Stripe. Both the webhook (/api/stripe/webhook) and the
//                 checkout return (/dashboard/billing/success) call it, so the
//                 plan is correct the moment the tutor lands back on the site
//                 and stays correct for everything that happens later (renewal,
//                 failed card, cancellation) without them being here.
//
// Sync always re-reads the subscription from Stripe rather than trusting the
// event payload. Webhooks arrive out of order and can be retried hours later; a
// fresh read makes every call idempotent and makes ordering irrelevant.
//
// Prices are found by lookup key (see src/lib/pricing.ts), created by
// scripts/stripe-setup.ts.

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tutors } from "@/db/schema";
import { env } from "@/lib/env";
import type { PlanId } from "@/lib/plans";
import {
  isPaidPlanId,
  parseLookupKey,
  PORTAL_CONFIG_NAME,
  priceLookupKey,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/pricing";

export { isPaidPlanId, PAID_PLAN_IDS, PLAN_PRICES_USD } from "@/lib/pricing";

let client: Stripe | undefined;
export function stripe(): Stripe {
  if (!client) client = new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Where the signup/login forms send a tutor who arrived from a pricing card.
 * Returns null for anything that isn't a real paid plan, so a hand-edited URL
 * just lands on the dashboard.
 */
export function checkoutPath(plan: unknown, billing: unknown): string | null {
  if (!isPaidPlanId(plan)) return null;
  const interval = billing === "annual" ? "year" : "month";
  return `/dashboard/billing/checkout?plan=${plan}&interval=${interval}`;
}

/**
 * Statuses that keep the paid plan. `past_due` is included on purpose: Stripe is
 * still retrying the card, and cutting a tutor off mid-retry (possibly mid-week
 * of lessons) over a card that will probably go through tomorrow is the wrong
 * call. If the retries run out Stripe moves it to `canceled` or `unpaid`, and
 * that event downgrades them.
 */
const ENTITLED: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

export function isEntitled(status: string | null | undefined): boolean {
  return !!status && ENTITLED.has(status);
}

/**
 * The tutor's Stripe customer, created on first use.
 *
 * A stored id is checked before it's trusted. Test mode and live mode are
 * separate worlds in Stripe, so a customer created while testing against this
 * database simply doesn't exist once live keys are in — and every Checkout for
 * that tutor would fail with "No such customer". Such an id (or one deleted in
 * the dashboard) is replaced rather than left to break billing for good.
 */
export async function ensureCustomer(tutorId: string): Promise<string> {
  const [row] = await db
    .select({ email: tutors.email, name: tutors.name, customerId: tutors.stripeCustomerId })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  if (!row) throw new Error("Tutor not found.");

  if (row.customerId) {
    try {
      const existing = await stripe().customers.retrieve(row.customerId);
      if (!existing.deleted) return existing.id;
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeInvalidRequestError) || err.code !== "resource_missing") {
        throw err;
      }
    }
  }

  const customer = await stripe().customers.create({
    email: row.email,
    name: row.name,
    metadata: { tutorId },
  });
  await db.update(tutors).set({ stripeCustomerId: customer.id }).where(eq(tutors.id, tutorId));
  return customer.id;
}

async function priceFor(plan: PaidPlanId, interval: BillingInterval): Promise<string> {
  const key = priceLookupKey(plan, interval);
  const { data } = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (!data[0]) {
    throw new Error(`No active Stripe price with lookup key "${key}" — run scripts/stripe-setup.ts.`);
  }
  return data[0].id;
}

/**
 * URL to send the tutor to for this plan. A tutor who already has a live
 * subscription goes to the portal instead: a second Checkout would start a
 * second subscription and bill them twice.
 */
export async function checkoutUrl(
  tutorId: string,
  plan: PaidPlanId,
  interval: BillingInterval,
  origin: string,
): Promise<string> {
  const [row] = await db
    .select({ status: tutors.subscriptionStatus })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  if (isEntitled(row?.status)) return portalUrl(tutorId, origin);

  const [customer, price] = await Promise.all([ensureCustomer(tutorId), priceFor(plan, interval)]);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: tutorId,
    line_items: [{ price, quantity: 1 }],
    // Carried onto the subscription so every later webhook can find the tutor
    // without a customer lookup.
    subscription_data: { metadata: { tutorId } },
    allow_promotion_codes: true,
    success_url: `${origin}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/settings?billing=cancelled`,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout URL.");
  return session.url;
}

let portalConfigId: string | null | undefined;

/**
 * The portal configuration scripts/stripe-setup.ts created (plan switching
 * limited to BumbleNote's prices). Looked up once per server instance. Falls
 * back to the account's default configuration if it's missing, rather than
 * leaving "Manage billing" broken.
 */
async function portalConfiguration(): Promise<string | undefined> {
  if (portalConfigId === undefined) {
    const { data } = await stripe().billingPortal.configurations.list({ active: true, limit: 100 });
    portalConfigId = data.find((c) => c.name === PORTAL_CONFIG_NAME)?.id ?? null;
  }
  return portalConfigId ?? undefined;
}

export async function portalUrl(tutorId: string, origin: string): Promise<string> {
  const [customer, configuration] = await Promise.all([ensureCustomer(tutorId), portalConfiguration()]);
  const session = await stripe().billingPortal.sessions.create({
    customer,
    configuration,
    return_url: `${origin}/dashboard/settings`,
  });
  return session.url;
}

/**
 * Bring the tutor row in line with a subscription, re-read fresh from Stripe.
 * Safe to call any number of times, in any order.
 */
export async function syncSubscription(subscriptionId: string): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Metadata first (set at checkout); customer id as the fallback for a
  // subscription created by hand in the Stripe dashboard.
  const byMeta = sub.metadata?.tutorId;
  const [tutor] = await db
    .select({ id: tutors.id, subscriptionId: tutors.stripeSubscriptionId })
    .from(tutors)
    .where(byMeta ? eq(tutors.id, byMeta) : eq(tutors.stripeCustomerId, customerId))
    .limit(1);
  if (!tutor) {
    // Deleted account, or a subscription that isn't ours. Nothing to update.
    console.warn(`stripe sync: no tutor for subscription ${sub.id}`);
    return;
  }

  const entitled = isEntitled(sub.status);

  // An old, ended subscription must not downgrade a tutor who has since started
  // a new one — its late "deleted" webhook would otherwise wipe the new plan.
  if (tutor.subscriptionId && tutor.subscriptionId !== sub.id && !entitled) return;

  const item = sub.items.data[0];
  const parsed = parseLookupKey(item?.price.lookup_key ?? null);
  if (entitled && !parsed) {
    // A live subscription on a price we don't recognise. Leave the plan alone
    // rather than guessing, and make it loud.
    throw new Error(
      `Subscription ${sub.id} is ${sub.status} on price ${item?.price.id} with no BumbleNote lookup key.`,
    );
  }

  const plan: PlanId = entitled && parsed ? parsed.plan : "free";
  await db
    .update(tutors)
    .set({
      plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      billingInterval: parsed?.interval ?? null,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
      // `cancel_at` covers cancellations scheduled for a date; the portal's
      // "cancel at end of period" sets cancel_at_period_end.
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
    })
    .where(eq(tutors.id, tutor.id));
}

/**
 * Stop billing a tutor who is deleting their account. Immediate, not at period
 * end — there's no account left to use the rest of the period on. The customer
 * record is kept: Stripe holds the invoices, which we're obliged to retain.
 */
export async function cancelSubscriptionForDeletion(tutorId: string): Promise<void> {
  const [row] = await db
    .select({ subscriptionId: tutors.stripeSubscriptionId, status: tutors.subscriptionStatus })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  if (!row?.subscriptionId) return;
  if (row.status === "canceled" || row.status === "incomplete_expired") return;
  await stripe().subscriptions.cancel(row.subscriptionId);
}
