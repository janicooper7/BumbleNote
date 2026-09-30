// Extra lesson packs: granted once per paid Checkout, spent only after the plan's
// own lessons, soonest-expiring first, and counted into the quota a reservation
// is checked against. Run against real Postgres (PGlite), since the balance is
// replayed from the lessons table.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

import { migrate, pg } from "@/test/pglite-neon";
import { grantLessonPack } from "./lesson-packs";
import { isQuotaError, lessonUsage, releaseLesson, reserveLesson } from "./quota";

const S = "55555555-5555-4555-8555-555555555555";

// This month's billing period: subscribed and billed on the 1st (UTC).
const MONTH_START = `(date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')`;

let seq = 0;
async function lessons(n: number, createdAt = "now() - interval '1 minute'") {
  const prefix = `l${seq++}`;
  await pg.exec(`
    insert into sessions (id, tutor_id, student_id, student_name, student_initial, title, date, iso_date,
      duration_min, level_from, level_to, observed_level, talk_time, created_at)
    select '${prefix}-' || g, '${S}', 'ana', 'Ana', 'A', 't', 'd', '2026-09-01',
      45, 'B1', 'B2', 'B1', '{"tutor":50,"student":50}', ${createdAt}
    from generate_series(1, ${n}) g`);
}

async function pack(n: number, purchased: string, expires: string) {
  await pg.exec(`
    insert into lesson_packs (tutor_id, lessons, purchased_at, expires_at, stripe_session_id, amount_cents)
    values ('${S}', ${n}, ${purchased}, ${expires}, 'cs_${seq++}', 899)`);
}

const session = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_test_pack",
    mode: "payment",
    payment_status: "paid",
    created: Math.floor(Date.now() / 1000) - 60,
    amount_total: 1599,
    client_reference_id: S,
    metadata: { kind: "lesson_pack", tutorId: S, lessons: "20" },
    ...over,
  }) as Stripe.Checkout.Session;

async function refused(p: Promise<unknown>): Promise<boolean> {
  return p.then(
    () => false,
    (e: unknown) => isQuotaError(e),
  );
}

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  await pg.exec(`
    delete from lesson_packs; delete from lesson_reservations; delete from credit_grants;
    delete from sessions; delete from students; delete from tutors;
    insert into tutors (id, email, name, plan, subscription_status, credits_since, billing_anchor)
    values ('${S}', 's@x.io', 'S', 'starter', 'active', ${MONTH_START}, ${MONTH_START});
    insert into students (id, tutor_id, name, initial, level, goal, native, last_seen)
    values ('ana', '${S}', 'Ana', 'A', 'B1', 'g', 'es', 'today');`);
});

describe("grantLessonPack", () => {
  it("records a paid pack once, however many times it's delivered", async () => {
    expect(await grantLessonPack(session())).toBe(true);
    expect(await grantLessonPack(session())).toBe(true);
    const { rows } = await pg.query<{ lessons: number; months: number }>(
      `select lessons, extract(month from age(expires_at, purchased_at))::int months from lesson_packs`,
    );
    expect(rows).toEqual([{ lessons: 20, months: 3 }]);
  });

  it("ignores subscriptions, unpaid sessions and other one-off payments", async () => {
    expect(await grantLessonPack(session({ mode: "subscription" }))).toBe(false);
    expect(await grantLessonPack(session({ payment_status: "unpaid" }))).toBe(false);
    expect(await grantLessonPack(session({ metadata: {} }))).toBe(false);
    expect((await pg.query("select 1 from lesson_packs")).rows).toHaveLength(0);
  });
});

describe("spending packs", () => {
  it("lets a subscriber keep recording past the allowance once they buy a pack", async () => {
    await lessons(30);
    expect(await refused(reserveLesson(S, "r1"))).toBe(true);

    await grantLessonPack(session({ metadata: { kind: "lesson_pack", tutorId: S, lessons: "10" } }));
    const usage = await lessonUsage(S);
    expect(usage).toMatchObject({ used: 30, limit: 30, remaining: 0, allowed: true, extraLessons: 10 });
    await reserveLesson(S, "r1");
    await releaseLesson("r1");
  });

  it("counts lessons past the allowance against the pack, and holds against what's left", async () => {
    await pack(10, "now() - interval '1 day'", "now() + interval '80 days'");
    await lessons(33); // 30 from the plan, 3 from the pack
    expect((await lessonUsage(S)).extraLessons).toBe(7);

    for (let i = 0; i < 7; i++) await reserveLesson(S, `h${i}`);
    expect(await refused(reserveLesson(S, "h7"))).toBe(true);
  });

  it("uses the plan's lessons first, even when the pack was bought earlier in the month", async () => {
    await pack(10, `${MONTH_START} + interval '1 hour'`, "now() + interval '80 days'");
    await lessons(12);
    expect(await lessonUsage(S)).toMatchObject({ remaining: 18, extraLessons: 10 });
  });

  it("draws from the pack expiring soonest, and drops expired ones", async () => {
    await pack(10, "now() - interval '80 days'", "now() + interval '5 days'");
    await pack(10, "now() - interval '1 day'", "now() + interval '85 days'");
    await pack(10, "now() - interval '100 days'", "now() - interval '10 days'"); // expired, unused
    await lessons(34); // 4 over the allowance, all from the soonest-expiring pack
    const usage = await lessonUsage(S);
    expect(usage.extraLessons).toBe(16);
    expect(usage.extraExpiresAt!.getTime()).toBeLessThan(Date.now() + 6 * 86_400_000);
  });

  it("keeps what an earlier month spent spent, and doesn't roll pack lessons over", async () => {
    // Subscribed a month earlier: last period used its 30 plus 5 from a pack.
    await pg.exec(`update tutors set credits_since = ${MONTH_START} - interval '1 month',
                   billing_anchor = ${MONTH_START} - interval '1 month' where id = '${S}'`);
    await pack(10, `${MONTH_START} - interval '20 days'`, "now() + interval '60 days'");
    await lessons(35, `${MONTH_START} - interval '10 days'`);
    const usage = await lessonUsage(S);
    expect(usage).toMatchObject({ rolledOver: 0, limit: 30, extraLessons: 5 });
  });

  it("isn't available without a live subscription", async () => {
    await pack(10, "now() - interval '1 day'", "now() + interval '80 days'");
    await pg.exec(`update tutors set plan = 'free', subscription_status = 'canceled', credits_since = null where id = '${S}'`);
    expect((await lessonUsage(S)).extraLessons).toBe(0);
  });
});
