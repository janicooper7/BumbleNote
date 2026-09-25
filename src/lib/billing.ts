// Stripe billing. Server-only.
//
// THE SHAPE OF IT:
//
//   Checkout    — /dashboard/billing/checkout sends a tutor to Stripe's hosted
//                 page for one plan + interval.
//   Portal      — /dashboard/billing/portal sends a paying tutor to Stripe's
//                 hosted portal to update the card, see invoices, or cancel.
//                 Plan changes are in-app only: the portal can't restart the
//                 billing period, which an upgrade needs.
//   In-app      — changePlan(), pauseSubscription() and resumeSubscription(),
//                 behind the Settings → Billing controls (src/app/actions/billing.ts).
//                 Upgrades apply now and start a new billing period, with the new
//                 plan's full price (less credit for the unused old one) charged
//                 today and a fresh lesson period that keeps what was left;
//                 downgrades are a
//                 subscription schedule that switches price at renewal; a pause
//                 voids invoices for one month and resumes by itself.
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
import { ensureCreditGrants, isPausedAt, startUpgradePeriod } from "@/lib/credits";
import { env } from "@/lib/env";
import { PLANS, type PlanId } from "@/lib/plans";
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
  // The schedule (with its prices) is expanded for a pending downgrade's plan.
  const sub = await stripe().subscriptions.retrieve(subscriptionId, {
    expand: ["schedule.phases.items.price"],
  });
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Metadata first (set at checkout); customer id as the fallback for a
  // subscription created by hand in the Stripe dashboard.
  const byMeta = sub.metadata?.tutorId;
  const [tutor] = await db
    .select({
      id: tutors.id,
      plan: tutors.plan,
      subscriptionId: tutors.stripeSubscriptionId,
      creditsSince: tutors.creditsSince,
      pausedAt: tutors.pausedAt,
      pauseResumesAt: tutors.pauseResumesAt,
    })
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

  // Settle the rollover bank up to now under the plan and pause as they stood,
  // before this change can rewrite them (see src/lib/credits.ts).
  await ensureCreditGrants(tutor.id);

  // An upgrade on this same subscription restarted billing: start a new lesson
  // period there, keeping what was left. Before the tutor row is written, so a
  // sync that fails after this retries it (the period is keyed on its start, so
  // it's added once).
  const anchor = new Date(sub.billing_cycle_anchor * 1000);
  if (
    entitled &&
    parsed &&
    tutor.creditsSince &&
    tutor.subscriptionId === sub.id &&
    isPaidPlanId(tutor.plan) &&
    PLAN_RANK[parsed.plan] > PLAN_RANK[tutor.plan]
  ) {
    await startUpgradePeriod(tutor.id, anchor, PLANS[parsed.plan].lessons);
  }

  const now = new Date();
  const pause = entitled ? sub.pause_collection : null;
  const wasPaused = isPausedAt(tutor.pausedAt, tutor.pauseResumesAt, now);
  let pausedAt = tutor.pausedAt;
  let pauseResumesAt = tutor.pauseResumesAt;
  if (pause) {
    // A pause that's already running keeps its start; a new one starts now.
    if (!wasPaused) pausedAt = now;
    pauseResumesAt = pause.resumes_at ? new Date(pause.resumes_at * 1000) : null;
  } else if (wasPaused) {
    // Resumed early (or the subscription ended mid-pause): close the window now.
    pauseResumesAt = now;
  }

  const pending = entitled ? pendingChange(sub, parsed?.plan ?? null) : null;

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
      // The rollover bank lives exactly as long as the unbroken subscription.
      creditsSince: entitled ? (tutor.creditsSince ?? now) : null,
      // Lesson periods renew on the billing date (src/lib/credits.ts).
      billingAnchor: entitled ? anchor : null,
      pausedAt,
      pauseResumesAt,
      pendingPlan: pending?.plan ?? null,
      pendingPlanAt: pending?.at ?? null,
    })
    .where(eq(tutors.id, tutor.id));

  // A new subscriber's first grant.
  if (entitled) await ensureCreditGrants(tutor.id);
}

/** A plan change a subscription schedule has queued for a later phase. */
function pendingChange(
  sub: Stripe.Subscription,
  current: PaidPlanId | null,
): { plan: PaidPlanId; at: Date } | null {
  const schedule = sub.schedule;
  if (!schedule || typeof schedule === "string") return null;
  const nowSec = Date.now() / 1000;
  const next = schedule.phases.find((p) => p.start_date > nowSec);
  const price = next?.items[0]?.price;
  const parsed = price && typeof price !== "string" && !price.deleted ? parseLookupKey(price.lookup_key) : null;
  if (!next || !parsed || parsed.plan === current) return null;
  return { plan: parsed.plan, at: new Date(next.start_date * 1000) };
}

/**
 * A problem the tutor can act on, with a message written for them. Server Actions
 * return it as a value (Next redacts thrown messages in production).
 */
export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

const PLAN_RANK: Record<PaidPlanId, number> = { starter: 0, advanced: 1, pro: 2 };

/** The tutor's live subscription, re-read from Stripe, or a BillingError. */
async function liveSubscription(tutorId: string): Promise<Stripe.Subscription> {
  const [row] = await db
    .select({ subscriptionId: tutors.stripeSubscriptionId })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  if (!row?.subscriptionId) throw new BillingError("You don't have a subscription to change.");
  const sub = await stripe().subscriptions.retrieve(row.subscriptionId);
  if (!isEntitled(sub.status)) throw new BillingError("You don't have an active subscription to change.");
  return sub;
}

function scheduleId(sub: Stripe.Subscription): string | null {
  return typeof sub.schedule === "string" ? sub.schedule : (sub.schedule?.id ?? null);
}

/**
 * Move the tutor to another paid plan, keeping their billing interval.
 *
 * Up: immediately, as a new billing period from today: the full price of the new
 * plan, less credit for the unused part of the old one, is charged now, and
 * syncSubscription() starts a new lesson period with the new plan's lessons plus
 * everything left from the old one (see src/lib/credits.ts). `pending_if_incomplete` means a declined card leaves them
 * on their current plan instead of handing over the bigger one unpaid.
 * Down: at the end of the period they've paid for, via a subscription schedule,
 * so they keep what they paid for until then.
 * Same plan: cancels a downgrade that was queued.
 */
export async function changePlan(tutorId: string, target: PaidPlanId): Promise<void> {
  const sub = await liveSubscription(tutorId);
  const item = sub.items.data[0];
  const current = parseLookupKey(item?.price.lookup_key ?? null);
  if (!item || !current) throw new BillingError("We couldn't read your current plan. Please contact us.");
  if (sub.status === "past_due") {
    throw new BillingError("Your last payment didn't go through. Update your card before changing plan.");
  }

  const existingSchedule = scheduleId(sub);

  if (target === current.plan) {
    if (existingSchedule) await stripe().subscriptionSchedules.release(existingSchedule);
  } else if (PLAN_RANK[target] > PLAN_RANK[current.plan]) {
    if (sub.pause_collection) {
      // A pause voids invoices, so an upgrade now would never be paid for.
      throw new BillingError("Your plan is paused. Resume it before upgrading.");
    }
    // An upgrade replaces any queued downgrade.
    if (existingSchedule) await stripe().subscriptionSchedules.release(existingSchedule);
    const updated = await stripe().subscriptions.update(sub.id, {
      items: [{ id: item.id, price: await priceFor(target, current.interval) }],
      billing_cycle_anchor: "now",
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
    });
    if (updated.pending_update) {
      throw new BillingError(
        "Your card was declined, so you're still on your current plan. Update your card in Manage billing and try again.",
      );
    }
  } else {
    if (sub.cancel_at_period_end || sub.cancel_at !== null) {
      throw new BillingError(
        "Your plan is set to cancel. Keep your subscription in Manage billing before changing plan.",
      );
    }
    const scheduleIdToUse =
      existingSchedule ??
      (await stripe().subscriptionSchedules.create({ from_subscription: sub.id })).id;
    const schedule = await stripe().subscriptionSchedules.retrieve(scheduleIdToUse);
    const phase = schedule.current_phase ?? schedule.phases[0];
    await stripe().subscriptionSchedules.update(scheduleIdToUse, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: item.price.id, quantity: 1 }],
          start_date: phase?.start_date ?? item.current_period_start,
          end_date: item.current_period_end,
        },
        {
          items: [{ price: await priceFor(target, current.interval), quantity: 1 }],
          duration: { interval: current.interval, interval_count: 1 },
          proration_behavior: "none",
        },
      ],
    });
  }

  await syncSubscription(sub.id);
}

/** Pause length. One month, then billing and the monthly allowance resume on their own. */
export function pauseEndsAt(from = new Date()): Date {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + 1);
  // 31 Jan + 1 month overflows into March; clamp to the last day of February.
  if (end.getUTCDate() !== from.getUTCDate()) end.setUTCDate(0);
  return end;
}

/**
 * Pause a monthly subscription for one month. Invoices falling due while paused
 * are voided (not charged, not owed later), no allowance is granted for the month
 * the pause covers, and banked lessons stay usable. Stripe lifts the pause itself
 * at `resumes_at` and the webhook syncs it back.
 */
export async function pauseSubscription(tutorId: string): Promise<void> {
  const sub = await liveSubscription(tutorId);
  const interval = parseLookupKey(sub.items.data[0]?.price.lookup_key ?? null)?.interval;
  if (sub.pause_collection) throw new BillingError("Your plan is already paused.");
  if (sub.status !== "active") {
    throw new BillingError("Your plan can't be paused right now. Update your card in Manage billing first.");
  }
  if (interval !== "month") {
    throw new BillingError("Pausing is only available on monthly billing — yearly plans are already paid up front.");
  }
  if (sub.cancel_at_period_end || sub.cancel_at !== null) {
    throw new BillingError("Your plan is already set to cancel, so there's nothing to pause.");
  }
  await stripe().subscriptions.update(sub.id, {
    pause_collection: {
      behavior: "void",
      resumes_at: Math.floor(pauseEndsAt().getTime() / 1000),
    },
  });
  await syncSubscription(sub.id);
}

/** End a pause early. The month the pause covered keeps no allowance. */
export async function resumeSubscription(tutorId: string): Promise<void> {
  const sub = await liveSubscription(tutorId);
  if (!sub.pause_collection) {
    await syncSubscription(sub.id);
    return;
  }
  await stripe().subscriptions.update(sub.id, { pause_collection: "" });
  await syncSubscription(sub.id);
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
