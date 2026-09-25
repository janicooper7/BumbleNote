// Rolling lesson credits for subscribers. Server-only.
//
// Every calendar month (UTC) of an unbroken subscription has one `credit_grants`
// row: `lessons`, the plan's monthly allowance, and `carried_in`, what was left
// over from the month before — capped at the plan's rolloverCap (5/10/15), so
// nobody can bank months of allowance and then pause or coast on it. Available
// this month = lessons + carried_in; used = counted lessons this month.
//
//   carried_in(m) = min(cap, max(0, lessons(m−1) + carried_in(m−1) − used(m−1)))
//
// When the subscription ends, syncSubscription() clears `tutors.credits_since`
// and the bank goes with it; a new subscription starts from zero.
//
// Rows are created lazily — by quota reads and by syncSubscription() — rather
// than by a cron, backfilling any months missed since the last one. Each month is
// decided exactly once (ON CONFLICT DO NOTHING), a paused month included, as a
// 0 allowance: the pause fields on the tutor row only remember the latest pause,
// so a month has to be settled before a later pause could overwrite the evidence.
// syncSubscription() settles BEFORE it writes a pause or plan change for that
// reason. A finished month's lesson count can't change afterwards (a lesson
// counts in the month it's written), so the computation is deterministic and two
// concurrent settlements insert identical rows.
//
// Only paid plans with a live subscription get rows. The free trial (lifetime)
// and the grandfathered `legacy` plan keep the calendar-month rules in quota.ts.

import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { creditGrants, sessions, tutors } from "@/db/schema";
import { isPaidPlanId, PAID_PLAN_IDS } from "@/lib/pricing";
import { MIN_COUNTED_LESSON_MIN, PLANS } from "@/lib/plans";

/** "YYYY-MM-01" for the UTC month containing `d`. */
export function monthKey(d: Date): string {
  return `${d.toISOString().slice(0, 7)}-01`;
}

function nextMonthKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return monthKey(d);
}

/** Whether `now` falls inside the tutor's latest pause. */
export function isPausedAt(
  pausedAt: Date | null,
  resumesAt: Date | null,
  now = new Date(),
): boolean {
  return !!pausedAt && pausedAt <= now && (!resumesAt || now < resumesAt);
}

/** What rolls into the next month from one that ended with `left` unused. */
export function carryOver(left: number, cap: number): number {
  return Math.min(cap, Math.max(0, left));
}

/**
 * Settle every month of the tutor's current subscription up to and including
 * this one. One query when there's nothing to do.
 */
export async function ensureCreditGrants(tutorId: string, now = new Date()): Promise<void> {
  const current = monthKey(now);
  const [t] = await db
    .select({
      plan: tutors.plan,
      creditsSince: tutors.creditsSince,
      pausedAt: tutors.pausedAt,
      pauseResumesAt: tutors.pauseResumesAt,
      last: sql<string | null>`(select max(${creditGrants.month})::text from ${creditGrants}
                                where ${creditGrants.tutorId} = ${tutors.id})`,
    })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  if (!t?.creditsSince || !isPaidPlanId(t.plan)) return;
  const first = monthKey(t.creditsSince);
  if (t.last && t.last >= current && t.last >= first) return;

  const plan = PLANS[t.plan];
  const [grants, usedRows] = await Promise.all([
    db
      .select({ month: creditGrants.month, lessons: creditGrants.lessons, carriedIn: creditGrants.carriedIn })
      .from(creditGrants)
      .where(and(eq(creditGrants.tutorId, tutorId), gte(creditGrants.month, first))),
    db
      .select({
        month: sql<string>`to_char(${sessions.createdAt} at time zone 'UTC', 'YYYY-MM-01')`,
        n: sql<number>`count(*)::int`,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.tutorId, tutorId),
          gte(sessions.createdAt, t.creditsSince),
          gte(sessions.durationMin, MIN_COUNTED_LESSON_MIN),
        ),
      )
      .groupBy(sql`1`),
  ]);
  const existing = new Map(grants.map((g) => [g.month, g]));
  const used = new Map(usedRows.map((r) => [r.month, Number(r.n)]));

  const inserts: (typeof creditGrants.$inferInsert)[] = [];
  let prev: { month: string; lessons: number; carriedIn: number } | undefined;
  for (let m = first; m <= current; m = nextMonthKey(m)) {
    let row = existing.get(m);
    if (!row) {
      const start = new Date(`${m}T00:00:00Z`);
      const paused = isPausedAt(t.pausedAt, t.pauseResumesAt, start);
      row = {
        month: m,
        lessons: paused ? 0 : plan.lessons,
        carriedIn: prev ? carryOver(prev.lessons + prev.carriedIn - (used.get(prev.month) ?? 0), plan.rolloverCap) : 0,
      };
      inserts.push({ tutorId, ...row });
    }
    prev = row;
  }
  if (inserts.length) await db.insert(creditGrants).values(inserts).onConflictDoNothing();
}

/** Each paid plan's monthly allowance, as a SQL expression over `tutors.plan`. */
const planLessons: SQL = sql`(case ${tutors.plan} ${sql.join(
  PAID_PLAN_IDS.map((id) => sql`when ${id} then ${PLANS[id].lessons}::int`),
  sql` `,
)} else 0 end)`;

/**
 * After an upgrade, raise this month's allowance to the new plan's — the tutor
 * paid the prorated difference and gets the bigger plan straight away. Never
 * lowers it (a downgrade takes effect at renewal, and this month was paid for at
 * the old price), and leaves a paused month at 0.
 */
export async function topUpCurrentMonth(tutorId: string, now = new Date()): Promise<void> {
  await db.execute(sql`
    update ${creditGrants} set lessons = ${planLessons}
    from ${tutors}
    where ${tutors.id} = ${tutorId}
      and ${creditGrants.tutorId} = ${tutorId}
      and ${creditGrants.month} = ${monthKey(now)}
      and ${creditGrants.lessons} > 0
      and ${creditGrants.lessons} < ${planLessons}`);
}

/** This month's available lessons (allowance + carried in), as SQL; 0 if unsettled. */
export function currentGrantSql(tutorId: string, now = new Date()): SQL {
  return sql`coalesce((select ${creditGrants.lessons} + ${creditGrants.carriedIn} from ${creditGrants}
              where ${creditGrants.tutorId} = ${tutorId} and ${creditGrants.month} = ${monthKey(now)}), 0)`;
}
