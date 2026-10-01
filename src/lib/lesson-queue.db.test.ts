// The transcription queue, run against real Postgres (PGlite) through the app's
// own db module. The slot cap, queue order and orphan pick-up all live in SQL,
// so faking the database would test nothing.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

// An in-memory stand-in for the queue flag's blob store.
const blobs = vi.hoisted(() => new Map<string, string>());
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    get: async (key: string) => blobs.get(key) ?? null,
    set: async (key: string, value: string) => void blobs.set(key, value),
    delete: async (key: string) => void blobs.delete(key),
  }),
}));

import { migrate, pg } from "@/test/pglite-neon";
import {
  claimSlot,
  enterQueue,
  lessonJobsFor,
  queueFlagRaised,
  releaseSlot,
  settleQueueFlag,
  takeOrphans,
  TRANSCRIBE_SLOTS,
  waitForSlot,
} from "./lesson-queue";

const T = "22222222-2222-2222-2222-222222222222";
const T2 = "33333333-3333-3333-3333-333333333333";

/** Queue `n` lessons a second apart, oldest first, so their order is certain. */
async function queue(n: number, prefix = "u", tutorId = T): Promise<string[]> {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
  for (const [i, uploadId] of ids.entries()) {
    await enterQueue({ uploadId, tutorId, studentId: "maria", durationMin: 45 }, "waiting");
    await pg.query(`update lesson_jobs set queued_at = now() - interval '1 hour' + interval '${i} seconds'
                    where upload_id = '${uploadId}'`);
  }
  return ids;
}

const transcribing = async () =>
  (await pg.query<{ n: number }>("select count(*)::int n from lesson_jobs where state = 'transcribing'")).rows[0].n;

beforeAll(async () => {
  await migrate();
  await pg.exec(`
    insert into tutors (id, email, name, plan) values ('${T}', 'q@x.io', 'Q', 'free'), ('${T2}', 'r@x.io', 'R', 'free');`);
});

beforeEach(async () => {
  await pg.query("delete from lesson_jobs");
  blobs.clear();
});

describe("transcription slots", () => {
  it("lets the first TRANSCRIBE_SLOTS lessons in and queues the rest in order", async () => {
    const ids = await queue(TRANSCRIBE_SLOTS + 2);
    for (const id of ids.slice(0, TRANSCRIBE_SLOTS)) expect((await claimSlot(id)).ok).toBe(true);

    expect(await claimSlot(ids[TRANSCRIBE_SLOTS])).toEqual({ ok: false, position: 1 });
    expect(await claimSlot(ids[TRANSCRIBE_SLOTS + 1])).toEqual({ ok: false, position: 2 });
    expect(await transcribing()).toBe(TRANSCRIBE_SLOTS);
  });

  it("never goes over the cap when everyone asks at once", async () => {
    const ids = await queue(TRANSCRIBE_SLOTS + 10);
    const claims = await Promise.all(ids.map((id) => claimSlot(id)));
    expect(claims.filter((c) => c.ok)).toHaveLength(TRANSCRIBE_SLOTS);
    expect(await transcribing()).toBe(TRANSCRIBE_SLOTS);
  });

  it("gives a freed slot to the lesson that has waited longest", async () => {
    const ids = await queue(TRANSCRIBE_SLOTS + 2);
    for (const id of ids) await claimSlot(id);
    const [older, newer] = ids.slice(TRANSCRIBE_SLOTS);

    await releaseSlot(ids[0]);
    expect((await claimSlot(newer)).ok).toBe(false);
    expect((await claimSlot(older)).ok).toBe(true);
    expect(await claimSlot(newer)).toEqual({ ok: false, position: 1 });
  });

  it("frees a slot held by a worker that died mid-transcription", async () => {
    const ids = await queue(TRANSCRIBE_SLOTS + 1);
    for (const id of ids) await claimSlot(id);
    await pg.query(`update lesson_jobs set claimed_at = now() - interval '11 minutes' where upload_id = '${ids[0]}'`);
    expect((await claimSlot(ids[TRANSCRIBE_SLOTS])).ok).toBe(true);
  });

  it("drafting lessons don't hold a slot", async () => {
    const ids = await queue(TRANSCRIBE_SLOTS + 1);
    for (const id of ids.slice(0, TRANSCRIBE_SLOTS)) await claimSlot(id);
    for (const id of ids.slice(0, TRANSCRIBE_SLOTS)) await releaseSlot(id);
    expect((await claimSlot(ids[TRANSCRIBE_SLOTS])).ok).toBe(true);
  });
});

describe("waiting lessons", () => {
  it("keeps a lesson's place when it re-enters the queue", async () => {
    const [first] = await queue(2);
    const before = (await pg.query<{ q: string }>(`select queued_at::text q from lesson_jobs where upload_id = '${first}'`)).rows[0].q;
    await enterQueue({ uploadId: first, tutorId: T, studentId: "maria", durationMin: 45 }, "waiting");
    const after = (await pg.query<{ q: string }>(`select queued_at::text q from lesson_jobs where upload_id = '${first}'`)).rows[0].q;
    expect(after).toBe(before);
  });

  it("doesn't let an orphan hold up the line, and hands it to the sweep once", async () => {
    const ids = await queue(TRANSCRIBE_SLOTS + 2);
    for (const id of ids) await claimSlot(id);
    const [orphan, live] = ids.slice(TRANSCRIBE_SLOTS);
    await pg.query(`update lesson_jobs set touched_at = now() - interval '2 minutes' where upload_id = '${orphan}'`);

    await releaseSlot(ids[0]);
    expect((await claimSlot(live)).ok).toBe(true);

    expect(await takeOrphans()).toEqual([{ uploadId: orphan, tutorId: T }]);
    expect(await takeOrphans()).toEqual([]);
  });

  it("gives up after its budget and reports where it is in line", async () => {
    const ids = await queue(TRANSCRIBE_SLOTS + 1);
    for (const id of ids.slice(0, TRANSCRIBE_SLOTS)) await claimSlot(id);
    const seen: number[] = [];
    const got = await waitForSlot(ids[TRANSCRIBE_SLOTS], {
      budgetMs: 0,
      onWaiting: async (p) => void seen.push(p),
    });
    expect(got).toBe(false);
    expect(seen).toEqual([1]);
  });

  it("lists a tutor's own lessons with their place in the whole queue", async () => {
    const mine = await queue(TRANSCRIBE_SLOTS, "a");
    for (const id of mine) await claimSlot(id);
    await queue(1, "b", T2);
    const [waiting] = await queue(1, "c");
    await pg.query(`update lesson_jobs set queued_at = now() where upload_id = '${waiting}'`);

    const list = await lessonJobsFor(T);
    expect(list).toHaveLength(TRANSCRIBE_SLOTS + 1);
    expect(list.at(-1)).toMatchObject({ uploadId: waiting, state: "waiting", position: 2 });
    expect(list[0]).toMatchObject({ state: "transcribing", position: null });
    expect(await lessonJobsFor(T2)).toHaveLength(1);
  });
});

describe("queue flag (lets the database sleep)", () => {
  it("is raised by a waiting lesson, not by one going straight to drafting", async () => {
    await enterQueue({ uploadId: "d1", tutorId: T, studentId: "maria", durationMin: 45 }, "drafting");
    expect(await queueFlagRaised()).toBe(false);
    await queue(1);
    expect(await queueFlagRaised()).toBe(true);
  });

  it("stays up while anything is waiting, and comes down once nothing is", async () => {
    const [id] = await queue(1);
    await settleQueueFlag();
    expect(await queueFlagRaised()).toBe(true);

    expect((await claimSlot(id)).ok).toBe(true);
    await settleQueueFlag();
    expect(await queueFlagRaised()).toBe(false);
  });

  it("is put back if a lesson queues between the check and the delete", async () => {
    // The delete lands after a new lesson wrote its row: the second look must catch it.
    const realDelete = blobs.delete.bind(blobs);
    blobs.delete = (key: string) => {
      const out = realDelete(key);
      void pg.query(
        `insert into lesson_jobs (upload_id, tutor_id, student_id, duration_min, state)
         values ('late', '${T}', 'maria', 45, 'waiting')`,
      );
      return out;
    };
    try {
      blobs.set("pending", "1");
      await settleQueueFlag();
    } finally {
      blobs.delete = realDelete;
    }
    expect(await queueFlagRaised()).toBe(true);
  });
});
