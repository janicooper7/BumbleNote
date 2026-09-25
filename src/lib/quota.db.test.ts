// Lesson-credit reservations, idempotent lesson creation and rate limiting,
// run against real Postgres (PGlite) through the app's own db module. These are
// the paths where the SQL itself is the logic — an advisory lock, conditional
// inserts, a data-modifying CTE — so faking the database would test nothing.

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

const claude = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: () => {
        claude.calls++;
        const feedback = {
          topic: "Test topic",
          observedLevel: "B1",
          talkTime: { tutor: 40, student: 60 },
          vocab: [{ term: "x", meaning: "y", example: "z" }],
          wentWell: ["You a", "You b"],
          focus: ["You c", "You d"],
          homework: "h",
          additionalInfo: "a",
          nextLesson: ["n"],
          lessonEndedAt: "e",
          tutorNotes: "t",
        };
        return {
          // A short await, so two concurrent drafts genuinely interleave.
          finalMessage: async () => {
            await new Promise((r) => setTimeout(r, 20));
            return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(feedback) }] };
          },
        };
      },
    };
  },
}));

import { migrate, pg } from "@/test/pglite-neon";
import { createDraftLessonCore } from "./lessons-core";
import { addMonths, ensureCreditGrants, nextBillingDate, startUpgradePeriod } from "./credits";
import { isQuotaError, lessonUsage, releaseLesson, reserveLesson } from "./quota";
import { rateLimit, rateLimitAll } from "./rate-limit";

const T = "11111111-1111-1111-1111-111111111111";

async function one<R>(sql: string): Promise<R> {
  return (await pg.query<R>(sql)).rows[0];
}
const lessonsCreated = async () => (await one<{ n: number }>("select lessons_created n from tutors")).n;
const held = async () => (await one<{ n: number }>("select count(*)::int n from lesson_reservations")).n;

async function quotaMessage(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(isQuotaError(err)).toBe(true);
  return (err as Error).message;
}

const draft = (uploadId: string, durationMin = 45) =>
  createDraftLessonCore(T, {
    uploadId,
    studentId: "maria",
    durationMin,
    transcript: "Tutor: hello there, how was your week?\nStudent: it was good, I went to the park.",
  });

async function addLessons(n: number, { createdAt = "now()", prefix = "bulk" } = {}) {
  await pg.exec(`
    insert into sessions (id, tutor_id, student_id, student_name, student_initial, title, date, iso_date,
      duration_min, level_from, level_to, observed_level, talk_time, created_at)
    select '${prefix}-' || g, '${T}', 'maria', 'Maria', 'M', 't', 'd', '2026-09-01',
      45, 'B1', 'B2', 'B1', '{"tutor":50,"student":50}', ${createdAt}
    from generate_series(1, ${n}) g`);
}

beforeAll(async () => {
  await migrate();
  await pg.exec(`
    insert into tutors (id, email, name, plan) values ('${T}', 't@x.io', 'T', 'free');
    insert into students (id, tutor_id, name, initial, level, goal, native, last_seen)
    values ('maria', '${T}', 'Maria', 'M', 'B1 → B2', 'g', 'es', 'today');`);
});

// The tests in each block build on one another's state, in order.
describe("lesson credits on the free trial (2 lifetime)", () => {
  it("holds a credit per upload and refuses once they're all held", async () => {
    await reserveLesson(T, "u1");
    await reserveLesson(T, "u2");
    expect(await quotaMessage(reserveLesson(T, "u3"))).toMatch(/being processed/);
  });

  it("re-reserving the same upload refreshes its hold instead of taking another", async () => {
    await reserveLesson(T, "u1");
    expect(await held()).toBe(2);
  });

  it("releases idempotently, and a released credit can be reused", async () => {
    await releaseLesson("u2");
    await releaseLesson("u2");
    await reserveLesson(T, "u3");
  });

  it("stops counting a hold past its TTL (a worker that was killed)", async () => {
    await pg.exec(`update lesson_reservations set created_at = now() - interval '21 minutes' where upload_id = 'u3'`);
    await reserveLesson(T, "u4");
    await pg.exec(`delete from lesson_reservations where upload_id in ('u3', 'u4')`);
  });
});

describe("idempotent lesson creation", () => {
  it("writes the lesson, counts it and consumes its credit", async () => {
    const { id } = await draft("u1");
    expect(id).toBe("s-maria-1");
    expect(claude.calls).toBe(1);
    expect(await lessonsCreated()).toBe(1);
    expect(await held()).toBe(0);
  });

  it("returns the existing lesson for a rerun, without calling Claude or counting again", async () => {
    expect((await draft("u1")).id).toBe("s-maria-1");
    expect(claude.calls).toBe(1);
    expect(await lessonsCreated()).toBe(1);
  });

  it("two concurrent runs of one upload write one lesson and count it once", async () => {
    const [a, b] = await Promise.all([draft("race"), draft("race")]);
    expect(a.id).toBe(b.id);
    expect((await one<{ n: number }>("select count(*)::int n from sessions where upload_id = 'race'")).n).toBe(1);
    expect(await lessonsCreated()).toBe(2);
  });

  it("doesn't use a trial credit for a recording under 25 minutes", async () => {
    await draft("short", 10);
    expect(await lessonsCreated()).toBe(2);
  });

  it("refuses with the trial message once the trial is used up", async () => {
    expect(await quotaMessage(reserveLesson(T, "u5"))).toMatch(/used your 2 free trial lessons/);
  });

  it("lets operator recovery hold a credit past the limit", async () => {
    await reserveLesson(T, "admin", { enforce: false });
    await releaseLesson("admin");
  });
});

describe("lesson credits on a monthly plan (Starter, 30)", () => {
  beforeAll(async () => {
    await pg.exec(`update tutors set plan = 'starter'`);
    // 2 counted lessons this month so far (the short one doesn't count); make it 29.
    await addLessons(27);
  });

  it("counts held credits alongside this month's lessons", async () => {
    await reserveLesson(T, "m1");
    expect(await quotaMessage(reserveLesson(T, "m2"))).toMatch(/being processed/);
    await releaseLesson("m1");
  });

  it("ignores last month's lessons", async () => {
    await addLessons(5, { createdAt: "now() - interval '40 days'", prefix: "old" });
    await reserveLesson(T, "m2");
    await releaseLesson("m2");
  });

  it("refuses with the monthly message at the limit", async () => {
    await addLessons(1, { prefix: "thirtieth" });
    expect(await quotaMessage(reserveLesson(T, "m3"))).toMatch(/all 30 lessons on the Starter plan/);
  });
});

const grants = async (tutor: string) =>
  (
    await pg.query<{ lessons: number; carried_in: number }>(
      `select lessons, carried_in from credit_grants where tutor_id = '${tutor}' order by period_start`,
    )
  ).rows.map((r) => [r.lessons, r.carried_in]);

async function lessonsFor(tutor: string, student: string, n: number, createdAt: string, prefix: string) {
  if (n === 0) return;
  await pg.exec(`
    insert into sessions (id, tutor_id, student_id, student_name, student_initial, title, date, iso_date,
      duration_min, level_from, level_to, observed_level, talk_time, created_at)
    select '${prefix}-' || g, '${tutor}', '${student}', 'A', 'A', 't', 'd', '2026-09-01',
      45, 'B1', 'B2', 'B1', '{"tutor":50,"student":50}', ${createdAt}
    from generate_series(1, ${n}) g`);
}

describe("rolling credits for a subscriber (Starter: 30 a month, up to 5 carried over)", () => {
  const S = "22222222-2222-2222-2222-222222222222";
  // First of the month, `n` months ago (UTC), plus a few days.
  const monthsAgo = (n: number, days = 2) =>
    `(date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') - interval '${n} months' + interval '${days} days'`;

  beforeAll(async () => {
    // Billed on the 1st; subscribed on the 3rd, three months ago.
    await pg.exec(`
      insert into tutors (id, email, name, plan, subscription_status, credits_since, billing_anchor)
      values ('${S}', 's@x.io', 'S', 'starter', 'active', ${monthsAgo(3)}, ${monthsAgo(3, 0)});
      insert into students (id, tutor_id, name, initial, level, goal, native, last_seen)
      values ('ana', '${S}', 'Ana', 'A', 'B1', 'g', 'es', 'today');`);
    await lessonsFor(S, "ana", 20, monthsAgo(3, 5), "m3"); // 10 left, capped to 5
    await lessonsFor(S, "ana", 0, monthsAgo(2, 5), "m2"); // 35 left, capped to 5
    await lessonsFor(S, "ana", 34, monthsAgo(1, 5), "m1"); // 1 left
  });

  it("backfills every period, carrying over the leftover up to the plan's cap", async () => {
    await ensureCreditGrants(S);
    expect(await grants(S)).toEqual([
      [30, 0],
      [30, 5],
      [30, 5],
      [30, 1],
    ]);
  });

  it("reports this period's allowance plus what carried in, and when the next arrives", async () => {
    const usage = await lessonUsage(S);
    expect(usage).toMatchObject({ used: 0, limit: 31, rolledOver: 1, rollover: true, paused: false });
    const now = new Date();
    expect(usage.renewsAt).toEqual(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
  });

  it("enforces the allowance plus carry-over, with the rollover message", async () => {
    await lessonsFor(S, "ana", 30, "now()", "m0");
    await reserveLesson(S, "r31");
    await releaseLesson("r31");
    await lessonsFor(S, "ana", 1, "now()", "m0-last");
    expect(await quotaMessage(reserveLesson(S, "r32"))).toMatch(
      /all 31 lessons on the Starter plan this period, including any carried over\. Your next 30 arrive on 1 /,
    );
  });

  it("grants nothing for a period paused over, but still carries the bank through it", async () => {
    const P = "33333333-3333-3333-3333-333333333333";
    await pg.exec(`
      insert into tutors (id, email, name, plan, subscription_status, credits_since, billing_anchor, paused_at, pause_resumes_at)
      values ('${P}', 'p@x.io', 'P', 'pro', 'active', ${monthsAgo(2)}, ${monthsAgo(2, 0)},
        ${monthsAgo(2, 20)}, ${monthsAgo(2, 20)} + interval '1 month');
      insert into students (id, tutor_id, name, initial, level, goal, native, last_seen)
      values ('bo', '${P}', 'Bo', 'B', 'B1', 'g', 'es', 'today');`);
    await lessonsFor(P, "bo", 100, monthsAgo(2, 5), "p2"); // 30 left, capped to 15
    await lessonsFor(P, "bo", 4, monthsAgo(1, 5), "p1"); // paused period: 15 − 4 = 11
    await ensureCreditGrants(P);
    expect(await grants(P)).toEqual([
      [130, 0],
      [0, 15],
      [130, 11],
    ]);
  });

  it("leaves a tutor without a live subscription on the plain monthly reset", async () => {
    expect((await lessonUsage(T)).rollover).toBe(false);
  });
});

describe("lesson periods follow the billing date", () => {
  const U = "44444444-4444-4444-4444-444444444444";
  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    // Subscribed to Starter on 20 January at 10:00, so billed on the 20th.
    await pg.exec(`
      insert into tutors (id, email, name, plan, subscription_status, credits_since, billing_anchor)
      values ('${U}', 'u@x.io', 'U', 'starter', 'active', '2026-01-20T10:00:00Z', '2026-01-20T10:00:00Z');
      insert into students (id, tutor_id, name, initial, level, goal, native, last_seen)
      values ('cy', '${U}', 'Cy', 'C', 'B1', 'g', 'es', 'today');`);
    await lessonsFor(U, "cy", 20, "'2026-01-25T12:00:00Z'", "u1");
    await lessonsFor(U, "cy", 8, "'2026-02-20T09:00:00Z'", "u2"); // an hour before renewal
    await lessonsFor(U, "cy", 3, "'2026-02-20T11:00:00Z'", "u3"); // an hour after
  });

  it("renews at the billing date's time, not on the 1st", async () => {
    const period = await ensureCreditGrants(U, at("2026-03-01T00:00:00Z"));
    expect(await grants(U)).toEqual([
      [30, 0],
      [30, 2], // 28 used before the renewal
    ]);
    expect(period).toEqual({
      start: at("2026-02-20T10:00:00Z"),
      end: at("2026-03-20T10:00:00Z"),
      lessons: 30,
      carriedIn: 2,
    });
  });

  it("starts a new period on upgrade, keeping everything left, uncapped, once", async () => {
    const upgradedAt = at("2026-03-01T12:00:00Z");
    await startUpgradePeriod(U, upgradedAt, 75);
    await startUpgradePeriod(U, upgradedAt, 75); // the same sync, repeated
    expect((await grants(U)).slice(2)).toEqual([[75, 29]]); // 30 + 2 − 3
    await pg.exec(`update tutors set plan = 'advanced', billing_anchor = '${upgradedAt.toISOString()}' where id = '${U}'`);
    expect(await ensureCreditGrants(U, at("2026-03-15T00:00:00Z"))).toMatchObject({
      start: upgradedAt,
      end: at("2026-04-01T12:00:00Z"),
      lessons: 75,
      carriedIn: 29,
    });
  });

  it("then renews monthly from the upgrade, with the normal cap", async () => {
    await lessonsFor(U, "cy", 5, "'2026-03-10T12:00:00Z'", "u4");
    await ensureCreditGrants(U, at("2026-04-02T00:00:00Z"));
    expect((await grants(U)).at(-1)).toEqual([75, 10]); // 99 unused, capped to Advanced's 10
  });

  it("gives a period that starts at a queued downgrade the new plan", async () => {
    await pg.exec(`update tutors set pending_plan = 'starter', pending_plan_at = '2026-05-01T12:00:00Z' where id = '${U}'`);
    await ensureCreditGrants(U, at("2026-05-02T00:00:00Z"));
    expect((await grants(U)).at(-1)).toEqual([30, 5]);
  });
});

describe("billing dates", () => {
  it("clamp to the end of a shorter month, then return to the anchor's day", () => {
    const jan31 = new Date("2026-01-31T08:00:00Z");
    expect(addMonths(jan31, 1)).toEqual(new Date("2026-02-28T08:00:00Z"));
    expect(addMonths(jan31, 2)).toEqual(new Date("2026-03-31T08:00:00Z"));
    expect(nextBillingDate(jan31, new Date("2026-02-28T08:00:00Z"))).toEqual(new Date("2026-03-31T08:00:00Z"));
  });

  it("find the next one strictly after, even before the anchor", () => {
    const anchor = new Date("2026-03-01T12:00:00Z");
    expect(nextBillingDate(anchor, anchor)).toEqual(new Date("2026-04-01T12:00:00Z"));
    expect(nextBillingDate(anchor, new Date("2026-02-10T00:00:00Z"))).toEqual(anchor);
  });
});

describe("rateLimit", () => {
  it("allows up to the limit, then refuses with a retry-after inside the window", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit({ key: "t:a", limit: 3, windowSec: 60 })).ok).toBe(true);
    const denied = await rateLimit({ key: "t:a", limit: 3, windowSec: 60 });
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("lets exactly `limit` through a parallel burst", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rateLimit({ key: "t:burst", limit: 5, windowSec: 60 })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });

  it("rateLimitAll refuses if any rule does, and still counts the rest", async () => {
    const result = await rateLimitAll([
      { key: "t:a", limit: 3, windowSec: 60 },
      { key: "t:b", limit: 3, windowSec: 60 },
    ]);
    expect(result.ok).toBe(false);
    expect((await one<{ count: number }>("select count from rate_limits where key = 't:b'")).count).toBe(1);
  });
});
