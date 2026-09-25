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
import { isQuotaError, releaseLesson, reserveLesson } from "./quota";
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
