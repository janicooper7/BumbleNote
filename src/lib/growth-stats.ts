// Sign-ups, trial use, subscribers and recurring revenue, for /admin/growth and
// scripts/growth-stats.ts (which feeds the "Bumblenote Growth" artifact).
//
// Accounts in ADMIN_EMAILS are left out of every count, and grandfathered
// `legacy` (early access) tutors are counted only in `legacy`.
// Revenue uses today's list prices (src/lib/pricing.ts); a subscriber still on
// an older Stripe price is counted at the current one.

import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { PAID_PLAN_IDS, PLAN_PRICES_USD, toCents, type PaidPlanId } from "@/lib/pricing";

// Stripe statuses that still pay (past_due is retrying a failed card).
const PAYING = ["active", "trialing", "past_due"];

export type GrowthStats = {
  updatedAt: string;
  signups: number;
  signups24h: number;
  signups7d: number;
  /** Recorded at least one lesson. */
  trialStarted: number;
  /** Recorded both free lessons. */
  trialFinished: number;
  legacy: number;
  subscribed: number;
  pastDue: number;
  cancelling: number;
  /** USD a month; annual plans count as a twelfth of the yearly price. */
  mrr: number;
  byPlan: { plan: PaidPlanId; month: number; year: number; mrr: number }[];
  /** Sign-ups per UTC day, oldest first, ending today. */
  daily: { day: string; n: number }[];
  waitlist: number;
};

export async function getGrowthStats(): Promise<GrowthStats> {
  // Raw driver rather than drizzle: the admin filter needs a real array
  // parameter (`<> all($1)`), which an empty ADMIN_EMAILS keeps valid.
  const sql = neon(env.DATABASE_URL);
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const [[totals], subs, daily, [waitlist]] = await Promise.all([
    sql`
      select
        count(*) filter (where plan <> 'legacy')::int as signups,
        count(*) filter (where created_at >= now() - interval '1 day' and plan <> 'legacy')::int as signups_24h,
        count(*) filter (where created_at >= now() - interval '7 days' and plan <> 'legacy')::int as signups_7d,
        count(*) filter (where lessons_created >= 1 and plan <> 'legacy')::int as trial_started,
        count(*) filter (where lessons_created >= 2 and plan <> 'legacy')::int as trial_finished,
        count(*) filter (where plan = 'legacy')::int as legacy
      from tutors
      where lower(email) <> all(${admins})`,
    sql`
      select plan, coalesce(billing_interval, 'month') as interval, subscription_status as status,
             cancel_at_period_end as cancelling, count(*)::int as n
      from tutors
      where subscription_status = any(${PAYING})
        and plan = any(${[...PAID_PLAN_IDS]})
        and lower(email) <> all(${admins})
      group by 1, 2, 3, 4`,
    sql`
      select to_char(d, 'YYYY-MM-DD') as day, count(t.id)::int as n
      from generate_series(current_date - 29, current_date, interval '1 day') d
      left join tutors t
        on t.created_at::date = d::date and t.plan <> 'legacy' and lower(t.email) <> all(${admins})
      group by d order by d`,
    sql`select count(*)::int as n from waitlist`,
  ]);

  let mrrCents = 0;
  let subscribed = 0;
  let pastDue = 0;
  let cancelling = 0;
  const byPlan = Object.fromEntries(
    PAID_PLAN_IDS.map((id) => [id, { plan: id, month: 0, year: 0, mrrCents: 0 }]),
  ) as Record<PaidPlanId, { plan: PaidPlanId; month: number; year: number; mrrCents: number }>;

  for (const r of subs) {
    const plan = r.plan as PaidPlanId;
    const interval = r.interval === "year" ? "year" : "month";
    const n = r.n as number;
    const monthly =
      interval === "year" ? toCents(PLAN_PRICES_USD[plan].year) / 12 : toCents(PLAN_PRICES_USD[plan].month);
    subscribed += n;
    if (r.status === "past_due") pastDue += n;
    if (r.cancelling) cancelling += n;
    mrrCents += monthly * n;
    byPlan[plan][interval] += n;
    byPlan[plan].mrrCents += monthly * n;
  }

  return {
    updatedAt: new Date().toISOString(),
    signups: totals.signups,
    signups24h: totals.signups_24h,
    signups7d: totals.signups_7d,
    trialStarted: totals.trial_started,
    trialFinished: totals.trial_finished,
    legacy: totals.legacy,
    subscribed,
    pastDue,
    cancelling,
    mrr: Math.round(mrrCents) / 100,
    byPlan: PAID_PLAN_IDS.map((id) => ({
      plan: id,
      month: byPlan[id].month,
      year: byPlan[id].year,
      mrr: Math.round(byPlan[id].mrrCents) / 100,
    })),
    daily: daily.map((d) => ({ day: d.day as string, n: d.n as number })),
    waitlist: waitlist.n,
  };
}
