// Rolling lesson credits for subscribers. Server-only.
//
// A subscriber's lessons renew on their billing date, when the payment is
// collected, not on the 1st. Each lesson period of an unbroken subscription has
// one `credit_grants` row: `lessons`, the plan's monthly allowance, and
// `carried_in`, what was left over from the period before — capped at the
// plan's rolloverCap (5/10/15), so nobody can bank months of allowance and then
// pause or coast on it. Available this period = lessons + carried_in; used =
// counted lessons since the period began.
//
//   carried_in(p) = min(cap, max(0, lessons(p−1) + carried_in(p−1) − used(p−1)))
//
// Periods start at `tutors.billing_anchor` (Stripe's billing_cycle_anchor) plus
// whole months — the dates Stripe renews on, annual plans included (they pay
// yearly but get lessons monthly). The first period starts when the
// subscription does (`credits_since`) and runs to the next billing date.
//
// An upgrade restarts billing (src/lib/billing.ts changePlan), so it starts a new
// period at that moment (startUpgradePeriod): the new plan's full allowance,
// with EVERYTHING left from the cut-short period carried in, uncapped — those
// lessons were paid for and the tutor keeps them.
//
// When the subscription ends, syncSubscription() clears `tutors.credits_since`
// and the bank goes with it; a new subscription starts from zero.
//
// Rows are created lazily — by quota reads and by syncSubscription() — rather
// than by a cron, backfilling any periods missed since the last one. Each period
// is decided exactly once (ON CONFLICT DO NOTHING), a paused one included, as a
// 0 allowance: the pause fields on the tutor row only remember the latest pause,
// so a period has to be settled before a later pause could overwrite the
// evidence. syncSubscription() settles BEFORE it writes a pause or plan change
// for that reason. A downgrade queued for renewal (`pending_plan`) applies to
// periods from its date, so a period settled in the seconds before the renewal
// webhook lands still gets the right plan. A finished period's lesson count
// can't change afterwards (a lesson counts when it's written), so the
// computation is deterministic and two concurrent settlements insert identical
// rows.
//
// Only paid plans with a live subscription get rows. The free trial (lifetime)
// and the grandfathered `legacy` plan keep the calendar-month rules in quota.ts.

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditGrants, sessions, tutors } from "@/db/schema";
import { isPaidPlanId } from "@/lib/pricing";
import { MIN_COUNTED_LESSON_MIN, PLANS } from "@/lib/plans";

/**
 * `anchor` moved on `months` whole months, keeping its day and time of day, and
 * clamped to the end of a shorter month — as Stripe does: an anchor on the 31st
 * renews on 28 February, then 31 March.
 */
export function addMonths(anchor: Date, months: number): Date {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/** The first billing date strictly after `after`. */
export function nextBillingDate(anchor: Date, after: Date): Date {
  let k =
    (after.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (after.getUTCMonth() - anchor.getUTCMonth()) -
    1;
  while (addMonths(anchor, k) <= after) k++;
  return addMonths(anchor, k);
}

/** Whether `now` falls inside the tutor's latest pause. */
export function isPausedAt(
  pausedAt: Date | null,
  resumesAt: Date | null,
  now = new Date(),
): boolean {
  return !!pausedAt && pausedAt <= now && (!resumesAt || now < resumesAt);
}

/** What rolls into the next period from one that ended with `left` unused. */
export function carryOver(left: number, cap: number): number {
  return Math.min(cap, Math.max(0, left));
}

/** A subscriber's current lesson period. */
export type CreditPeriod = {
  start: Date;
  /** The next billing date, when the next period's lessons arrive. */
  end: Date;
  lessons: number;
  carriedIn: number;
};

type Grant = { start: Date; lessons: number; carriedIn: number };

/**
 * Settle every period of the tutor's current subscription up to and including
 * the one running now, and return that one — or null if the tutor has no live
 * paid subscription. Two parallel reads when there's nothing to do.
 */
export async function ensureCreditGrants(
  tutorId: string,
  now = new Date(),
): Promise<CreditPeriod | null> {
  const [[t], [latest]] = await Promise.all([
    db
      .select({
        plan: tutors.plan,
        creditsSince: tutors.creditsSince,
        billingAnchor: tutors.billingAnchor,
        pausedAt: tutors.pausedAt,
        pauseResumesAt: tutors.pauseResumesAt,
        pendingPlan: tutors.pendingPlan,
        pendingPlanAt: tutors.pendingPlanAt,
      })
      .from(tutors)
      .where(eq(tutors.id, tutorId))
      .limit(1),
    db
      .select({
        start: creditGrants.periodStart,
        lessons: creditGrants.lessons,
        carriedIn: creditGrants.carriedIn,
      })
      .from(creditGrants)
      .where(eq(creditGrants.tutorId, tutorId))
      .orderBy(desc(creditGrants.periodStart))
      .limit(1),
  ]);
  if (!t?.creditsSince || !isPaidPlanId(t.plan)) return null;
  const since = t.creditsSince;
  // Until a sync records Stripe's anchor, the subscription's own start.
  const anchor = t.billingAnchor ?? since;
  // A row from before this subscription belongs to an earlier, ended one.
  const current: Grant | undefined = latest && latest.start >= since ? latest : undefined;
  if (current) {
    const end = nextBillingDate(anchor, current.start);
    if (end > now) return { ...current, end };
  }

  // The periods to add: the first one if there's none yet, then every billing
  // date that has passed since the latest.
  const starts: Date[] = current ? [] : [since];
  for (
    let d = nextBillingDate(anchor, current?.start ?? since);
    d <= now;
    d = nextBillingDate(anchor, d)
  ) {
    starts.push(d);
  }

  // When each counted lesson in the periods now ending was written.
  const written = starts.length
    ? await db
        .select({ at: sessions.createdAt })
        .from(sessions)
        .where(
          and(
            eq(sessions.tutorId, tutorId),
            gte(sessions.createdAt, current?.start ?? since),
            lt(sessions.createdAt, starts[starts.length - 1]),
            gte(sessions.durationMin, MIN_COUNTED_LESSON_MIN),
          ),
        )
    : [];
  const usedBetween = (a: Date, b: Date) => written.filter((r) => r.at >= a && r.at < b).length;

  // A downgrade queued for renewal applies from its date.
  const planAt = (start: Date) =>
    PLANS[
      t.pendingPlan && isPaidPlanId(t.pendingPlan) && t.pendingPlanAt && start >= t.pendingPlanAt
        ? t.pendingPlan
        : t.plan
    ];

  const rows: Grant[] = [];
  let prev = current;
  for (const start of starts) {
    const plan = planAt(start);
    prev = {
      start,
      lessons: isPausedAt(t.pausedAt, t.pauseResumesAt, start) ? 0 : plan.lessons,
      carriedIn: prev
        ? carryOver(prev.lessons + prev.carriedIn - usedBetween(prev.start, start), plan.rolloverCap)
        : 0,
    };
    rows.push(prev);
  }
  await db
    .insert(creditGrants)
    .values(rows.map((r) => ({ tutorId, periodStart: r.start, lessons: r.lessons, carriedIn: r.carriedIn })))
    .onConflictDoNothing();
  // `starts` is never empty here: with no current period it holds `since`.
  const last = prev!;
  return { ...last, end: nextBillingDate(anchor, last.start) };
}

/**
 * An upgrade restarted billing at `start`: begin a new period there with the new
 * plan's `lessons`, carrying in everything left from the period it cuts short,
 * uncapped. Idempotent — the period is keyed on its start, so a sync repeated by
 * the webhook adds nothing. The period it cuts short must already be settled
 * (ensureCreditGrants).
 */
export async function startUpgradePeriod(
  tutorId: string,
  start: Date,
  lessons: number,
): Promise<void> {
  const [prev] = await db
    .select({
      start: creditGrants.periodStart,
      lessons: creditGrants.lessons,
      carriedIn: creditGrants.carriedIn,
    })
    .from(creditGrants)
    .where(eq(creditGrants.tutorId, tutorId))
    .orderBy(desc(creditGrants.periodStart))
    .limit(1);
  // Already started (a repeated sync), or an anchor that isn't new: nothing to do.
  if (!prev || prev.start >= start) return;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.tutorId, tutorId),
        gte(sessions.createdAt, prev.start),
        lt(sessions.createdAt, start),
        gte(sessions.durationMin, MIN_COUNTED_LESSON_MIN),
      ),
    );
  const left = Math.max(0, prev.lessons + prev.carriedIn - Number(row?.n ?? 0));
  await db
    .insert(creditGrants)
    .values({ tutorId, periodStart: start, lessons, carriedIn: left })
    .onConflictDoNothing();
}
