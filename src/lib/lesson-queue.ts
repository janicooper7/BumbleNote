// The transcription queue and the tutor's "in progress" list. Server-only.
//
// Deepgram serves at most 50 pre-recorded requests at once per project, and every
// lesson sends two (one per track). Past that it refuses the request and the
// lesson fails, so lessons take one of TRANSCRIBE_SLOTS slots before calling it,
// give it back straight after, and otherwise wait their turn in `queued_at`
// order. Claude's limits are far above anything we'd reach, so drafting isn't
// queued.
//
// Every lesson between /api/upload/complete and its draft has a row in
// lesson_jobs, which is also what the dashboard lists as in progress. The worker
// (netlify/functions/process) waits for a slot for up to IN_WORKER_WAIT_MS, then
// exits and leaves the lesson waiting; the lesson-queue sweep re-kicks it. That
// keeps a long queue from eating the worker's 15-minute budget.
//
// The sweep runs every minute, but a query every minute would keep Neon from
// ever scaling to zero. So a lesson entering the queue also sets a flag in
// Netlify Blobs, and the sweep only goes to the database while that flag is up
// (or once an hour, as a backstop in case setting it failed).

import { getStore } from "@netlify/blobs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonJobs, lessonReservations } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Lessons allowed to be with Deepgram at once: 40 requests of the 50 allowed.
 * TRANSCRIBE_SLOTS overrides it — lower to watch the queue work locally, higher
 * if the Deepgram plan's limit goes up.
 */
export const TRANSCRIBE_SLOTS = Number(process.env.TRANSCRIBE_SLOTS) || 20;

/**
 * A slot this old is free again. Transcribing an hour takes well under a
 * minute, so only a worker killed mid-call (which runs no cleanup) gets here.
 */
export const SLOT_TTL_MS = 10 * 60 * 1000;

/** How often a worker waiting for a slot asks again, and shows it's alive. */
export const WAIT_POLL_MS = 5000;

/**
 * A waiting lesson nobody has touched for this long has no worker behind it: the
 * one that queued it has exited. It stops holding up the line, and the sweep
 * starts a new worker for it.
 */
export const ORPHAN_AFTER_MS = 45 * 1000;

/**
 * How long one worker waits for a slot before leaving the lesson to the sweep.
 * Short, because the rest of its 15 minutes has to cover the worst case after
 * it: Claude's two 300-second attempts (lib/ai) plus transcription.
 */
export const IN_WORKER_WAIT_MS = 90 * 1000;

export type LessonJobState = "waiting" | "transcribing" | "drafting";

export type LessonJobRow = {
  uploadId: string;
  studentId: string;
  durationMin: number;
  state: LessonJobState;
  /** 1 = next in line. Only for waiting lessons. */
  position: number | null;
};

const secs = (ms: number) => sql`make_interval(secs => ${ms / 1000})`;

/** Queue order: oldest first, the upload id breaking ties. */
const ahead = (uploadId: string) => sql`(w.queued_at, w.upload_id) < (
  select queued_at, upload_id from ${lessonJobs} where upload_id = ${uploadId})`;

/**
 * Put a lesson on the list, waiting for a slot — or straight to drafting when
 * its transcript is already cached. A lesson already on the list keeps its
 * place in the queue.
 */
export async function enterQueue(
  job: { uploadId: string; tutorId: string; studentId: string; durationMin: number },
  state: "waiting" | "drafting",
): Promise<void> {
  await db
    .insert(lessonJobs)
    .values({ ...job, state })
    .onConflictDoUpdate({
      target: lessonJobs.uploadId,
      set: { state, claimedAt: null, touchedAt: sql`now()` },
    });
  // After the row, never before: settleQueueFlag relies on that order.
  if (state === "waiting") await raiseQueueFlag();
}

const QUEUE_STORE = "lesson-queue";
const PENDING_KEY = "pending";

/**
 * The flag's store, or null where blobs aren't available (plain `next dev`,
 * tests). Strong consistency, so a flag set a moment ago is never read as missing.
 */
function flagStore(): ReturnType<typeof getStore> | null {
  try {
    return getStore({ name: QUEUE_STORE, consistency: "strong" });
  } catch {
    return null;
  }
}

/** Tell the sweep a lesson may be waiting. Never throws: the hourly sweep is the backstop. */
async function raiseQueueFlag(): Promise<void> {
  try {
    await flagStore()?.set(PENDING_KEY, String(Date.now()));
  } catch (err) {
    console.error("could not raise the lesson-queue flag:", err);
  }
}

/**
 * Whether the sweep should look at the database. True whenever it can't tell,
 * so a blobs outage costs a database wake-up rather than a stranded lesson.
 */
export async function queueFlagRaised(): Promise<boolean> {
  const store = flagStore();
  if (!store) return true;
  try {
    return (await store.get(PENDING_KEY)) !== null;
  } catch {
    return true;
  }
}

async function anyWaiting(): Promise<boolean> {
  const res = await db.execute(sql`select 1 from ${lessonJobs} where state = 'waiting' limit 1`);
  return res.rows.length > 0;
}

/**
 * Lower the flag once nothing is waiting, so the sweep stops waking the
 * database. A lesson queued meanwhile wrote its row before raising the flag, so
 * if its raise landed before our delete, the second look finds the row and puts
 * the flag back.
 */
export async function settleQueueFlag(): Promise<void> {
  const store = flagStore();
  if (!store || (await anyWaiting())) return;
  try {
    await store.delete(PENDING_KEY);
  } catch (err) {
    console.error("could not lower the lesson-queue flag:", err);
    return;
  }
  if (await anyWaiting()) await raiseQueueFlag();
}

/**
 * Take a transcription slot if one is free and nobody still waiting is ahead of
 * this lesson. Otherwise say where it is in the line (position 1 = next).
 *
 * One transaction under a global advisory lock, so two workers can't both take
 * the last slot: each statement sees everything committed before the lock.
 */
export async function claimSlot(
  uploadId: string,
): Promise<{ ok: boolean; position: number }> {
  const [, claimed, place] = await db.batch([
    db.execute(sql`select pg_advisory_xact_lock(hashtextextended('transcribe-slots', 0))`),
    db.execute(sql`
      update ${lessonJobs} set state = 'transcribing', claimed_at = now(), touched_at = now()
      where upload_id = ${uploadId} and state = 'waiting'
        and (select count(*) from ${lessonJobs}
             where state = 'transcribing' and claimed_at > now() - ${secs(SLOT_TTL_MS)})
          + (select count(*) from ${lessonJobs} w
             where w.state = 'waiting' and w.touched_at > now() - ${secs(ORPHAN_AFTER_MS)}
               and ${ahead(uploadId)})
          < ${TRANSCRIBE_SLOTS}
      returning upload_id`),
    // Also the heartbeat that keeps this lesson from looking orphaned.
    db.execute(sql`
      update ${lessonJobs} set touched_at = now()
      where upload_id = ${uploadId} and state = 'waiting'
      returning (select count(*) from ${lessonJobs} w
                 where w.state = 'waiting' and ${ahead(uploadId)})::int + 1 as position`),
  ]);
  if (claimed.rows.length > 0) return { ok: true, position: 0 };
  const position = Number((place.rows[0] as { position?: number } | undefined)?.position ?? 1);
  return { ok: false, position };
}

/**
 * Wait for a slot, reporting the lesson's place in line whenever it changes.
 * False once `budgetMs` has passed without one: the lesson stays waiting for the
 * sweep to pick up.
 */
export async function waitForSlot(
  uploadId: string,
  { budgetMs, onWaiting }: { budgetMs: number; onWaiting: (position: number) => Promise<void> },
): Promise<boolean> {
  const giveUpAt = Date.now() + budgetMs;
  let shown = 0;
  for (;;) {
    const claim = await claimSlot(uploadId);
    if (claim.ok) return true;
    if (claim.position !== shown) {
      shown = claim.position;
      await onWaiting(claim.position);
    }
    if (Date.now() + WAIT_POLL_MS > giveUpAt) return false;
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
  }
}

/** Give the slot back once the transcript is in; the lesson moves on to drafting. */
export async function releaseSlot(uploadId: string): Promise<void> {
  await db
    .update(lessonJobs)
    .set({ state: "drafting", claimedAt: null, touchedAt: sql`now()` })
    .where(eq(lessonJobs.uploadId, uploadId));
}

/** Take a lesson off the list: it was drafted, or the attempt failed. Never throws. */
export async function leaveQueue(uploadId: string): Promise<void> {
  try {
    await db.delete(lessonJobs).where(eq(lessonJobs.uploadId, uploadId));
  } catch (err) {
    console.error(`could not take ${uploadId} off the lesson queue:`, err);
  }
}

/**
 * Waiting lessons with no worker behind them, oldest first, marked as picked up
 * so an overlapping sweep can't start a second worker for the same lesson.
 */
export async function takeOrphans(limit = TRANSCRIBE_SLOTS): Promise<{ uploadId: string; tutorId: string }[]> {
  const res = await db.execute(sql`
    update ${lessonJobs} set touched_at = now()
    where upload_id in (
      select upload_id from ${lessonJobs}
      where state = 'waiting' and touched_at < now() - ${secs(ORPHAN_AFTER_MS)}
      order by queued_at, upload_id
      limit ${limit}
      for update skip locked)
    returning upload_id, tutor_id`);
  return (res.rows as { upload_id: string; tutor_id: string }[]).map((r) => ({
    uploadId: r.upload_id,
    tutorId: r.tutor_id,
  }));
}

/** Minutes the longest-waiting lesson has been in the queue, or 0. */
export async function oldestWaitMinutes(): Promise<number> {
  const res = await db.execute(sql`
    select coalesce(extract(epoch from now() - min(queued_at)) / 60, 0)::float as minutes
    from ${lessonJobs} where state = 'waiting'`);
  return Number((res.rows[0] as { minutes?: number } | undefined)?.minutes ?? 0);
}

/**
 * Keep a lesson's held credit alive while it waits. Reservations stop counting
 * after RESERVATION_TTL_MS so a dead worker can't hold one forever, and a long
 * queue could otherwise outlast that.
 */
export async function refreshReservation(uploadId: string): Promise<void> {
  await db
    .update(lessonReservations)
    .set({ createdAt: sql`now()` })
    .where(eq(lessonReservations.uploadId, uploadId));
}

/**
 * Start the background worker for an upload. It answers 202 at once and keeps
 * running detached, so this only confirms the trigger was accepted.
 */
export async function startWorker(origin: string, uploadId: string): Promise<void> {
  const res = await fetch(`${origin}/.netlify/functions/process`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.INTERNAL_TASK_SECRET,
    },
    body: JSON.stringify({ uploadId }),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`Processing worker returned ${res.status}.`);
  }
}

/** A tutor's lessons in progress, oldest first. */
export async function lessonJobsFor(tutorId: string): Promise<LessonJobRow[]> {
  // Raw SQL so the outer row can be named: drizzle leaves column references in a
  // single-table select unqualified, and inside the subquery they'd bind to `w`.
  const res = await db.execute(sql`
    select j.upload_id, j.student_id, j.duration_min, j.state,
      case when j.state = 'waiting' then
        (select count(*) from ${lessonJobs} w
         where w.state = 'waiting' and (w.queued_at, w.upload_id) < (j.queued_at, j.upload_id))::int + 1
      end as position
    from ${lessonJobs} j
    where j.tutor_id = ${tutorId}
    order by j.queued_at, j.upload_id`);
  type Row = { upload_id: string; student_id: string; duration_min: number; state: string; position: number | null };
  return (res.rows as Row[]).map((r) => ({
    uploadId: r.upload_id,
    studentId: r.student_id,
    durationMin: Number(r.duration_min),
    state: r.state as LessonJobState,
    position: r.position === null ? null : Number(r.position),
  }));
}
