// Per-tutor usage limits. Server-only.
//
// WHERE THESE ARE ENFORCED, AND WHY THERE:
//
// The point of the cap is to bound *spend* — Deepgram transcription plus an
// Anthropic completion, several cents to a few dollars per lesson, on our keys.
// So the check belongs immediately before the first paid call on each path that
// can trigger one:
//
//   /api/upload/complete  — web + extension chunked uploads, checked before the
//                           background worker is triggered
//   /api/capture          — the extension's direct upload, checked before STT
//   restartProcessing()   — a retried failed upload (lib/failed-lessons)
//   createLessonFromAudio — the in-app server action, checked before STT
//
// It is deliberately NOT enforced inside createDraftLessonCore(). By the time
// that runs the money is already spent: rejecting there would bin a lesson the
// tutor just taught AND leave us holding the bill. Capping the row count after
// the fact protects nobody. The two entry points above are the complete set of
// callers that reach paid work, so guarding them bounds the spend exactly.
// (createDraftLessonCore does consume the hold, though — see RESERVATIONS.)
//
// Monthly plans count per calendar month (UTC) from `sessions.created_at` — when
// we did the work, not the lesson's nominal date, which the tutor can edit. The
// free trial is lifetime and counts `tutors.lessons_created` instead, which
// deleting a lesson doesn't lower.
//
// Subscribers' unused lessons roll over, up to a small cap per plan: their
// monthly limit is this month's `credit_grants` row — the allowance plus what
// carried in (src/lib/credits.ts) — rather than the bare plan number.
//
// Either way only lessons of MIN_COUNTED_LESSON_MIN or longer count, so a call
// that drops a few minutes in doesn't cost a credit. Starting a recording still
// needs a credit left — the length isn't known until it's over.
//
// RESERVATIONS: counting finished lessons alone is check-then-act. The lesson row
// only appears minutes later, when the worker finishes, so a tutor with one
// credit left who starts three uploads at once passes the check three times.
// The paid entry points therefore call reserveLesson(), which holds a credit
// (a lesson_reservations row) from the moment work starts until the lesson is
// written or the attempt fails, and counts held credits against the limit.
// assertLessonQuota() remains for read-only "can they?" checks.

import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditGrants, lessonReservations, sessions, students, tutors } from "@/db/schema";
import { currentGrantSql, ensureCreditGrants, isPausedAt, monthKey } from "@/lib/credits";
import { MIN_COUNTED_LESSON_MIN, planFor, type Plan } from "@/lib/plans";

/**
 * A limit the tutor has hit. Carries a message written for the tutor, so callers
 * can surface `err.message` directly instead of inventing their own copy.
 */
export class QuotaError extends Error {
  readonly plan: Plan;
  readonly used: number;
  readonly limit: number;

  constructor(message: string, plan: Plan, used: number, limit: number) {
    super(message);
    this.name = "QuotaError";
    this.plan = plan;
    this.used = used;
    this.limit = limit;
  }
}

export function isQuotaError(err: unknown): err is QuotaError {
  return err instanceof QuotaError;
}

/** First instant of the current UTC month. */
function currentMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Where this month's lesson count starts: the 1st, or a subscription begun since. */
function windowStart(creditsSince: Date | null): Date {
  const start = currentMonthStart();
  return creditsSince && creditsSince > start ? creditsSince : start;
}

async function tutorPlanRow(tutorId: string) {
  const [row] = await db
    .select({
      plan: tutors.plan,
      lessonsCreated: tutors.lessonsCreated,
      creditsSince: tutors.creditsSince,
      pausedAt: tutors.pausedAt,
      pauseResumesAt: tutors.pauseResumesAt,
    })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  const plan = planFor(row?.plan);
  return {
    plan,
    lessonsCreated: row?.lessonsCreated ?? 0,
    // Rollover applies to a live subscription on a monthly-allowance plan only.
    creditsSince: plan.lessonWindow === "month" ? (row?.creditsSince ?? null) : null,
    paused: isPausedAt(row?.pausedAt ?? null, row?.pauseResumesAt ?? null),
  };
}

async function planOf(tutorId: string): Promise<Plan> {
  return (await tutorPlanRow(tutorId)).plan;
}

export type LessonUsage = {
  plan: Plan;
  /** Lessons used in the current window (this month, or the trial). */
  used: number;
  /** Lessons available in the current window: for a subscriber, this month's
   *  grant plus whatever rolled over into it. */
  limit: number;
  remaining: number;
  allowed: boolean;
  /** True for a subscriber, whose unused lessons carry over month to month. */
  rollover: boolean;
  /** Lessons carried into this month from earlier months (subscribers only). */
  rolledOver: number;
  /** Subscription paused: no allowance this month, banked lessons still usable. */
  paused: boolean;
};

/** How many lessons this tutor has used in their plan's window, against its limit. */
export async function lessonUsage(tutorId: string): Promise<LessonUsage> {
  const { plan, lessonsCreated, creditsSince, paused } = await tutorPlanRow(tutorId);
  if (creditsSince) return bankedUsage(tutorId, plan, creditsSince, paused);

  let used = lessonsCreated;
  if (plan.lessonWindow === "month") {
    const [row] = await db
      .select({ n: count() })
      .from(sessions)
      .where(
        and(
          eq(sessions.tutorId, tutorId),
          gte(sessions.createdAt, currentMonthStart()),
          gte(sessions.durationMin, MIN_COUNTED_LESSON_MIN),
        ),
      );
    used = row?.n ?? 0;
  }

  const limit = plan.lessons;
  return {
    plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    allowed: used < limit,
    rollover: false,
    rolledOver: 0,
    paused: false,
  };
}

/**
 * A subscriber's month: this month's allowance plus what rolled over into it
 * (src/lib/credits.ts), against lessons since the 1st — or since the
 * subscription began, if that was later this month.
 */
async function bankedUsage(
  tutorId: string,
  plan: Plan,
  creditsSince: Date,
  paused: boolean,
): Promise<LessonUsage> {
  await ensureCreditGrants(tutorId);
  const [[grant], [row]] = await Promise.all([
    db
      .select({ lessons: creditGrants.lessons, carriedIn: creditGrants.carriedIn })
      .from(creditGrants)
      .where(and(eq(creditGrants.tutorId, tutorId), eq(creditGrants.month, monthKey(new Date()))))
      .limit(1),
    db
      .select({ n: count() })
      .from(sessions)
      .where(
        and(
          eq(sessions.tutorId, tutorId),
          gte(sessions.createdAt, windowStart(creditsSince)),
          gte(sessions.durationMin, MIN_COUNTED_LESSON_MIN),
        ),
      ),
  ]);
  const rolledOver = grant?.carriedIn ?? 0;
  const limit = (grant?.lessons ?? 0) + rolledOver;
  const used = row?.n ?? 0;
  return {
    plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    allowed: used < limit,
    rollover: true,
    rolledOver,
    paused,
  };
}

/** Throws QuotaError if this tutor may not process another lesson. */
export async function assertLessonQuota(tutorId: string): Promise<LessonUsage> {
  const usage = await lessonUsage(tutorId);
  if (!usage.allowed) {
    throw new QuotaError(
      usage.plan.lessonWindow === "lifetime"
        ? `You've used your ${usage.limit} free trial lessons. Choose a plan to keep recording lessons.`
        : usage.paused
          ? `Your ${usage.plan.name} plan is paused and you've used the lessons you carried over. ` +
            `Resume your plan in Settings to keep recording.`
          : usage.rollover
            ? `You've used all ${usage.limit} lessons on the ${usage.plan.name} plan this month, including any carried over. ` +
              `Your next ${usage.plan.lessons} arrive on the 1st — upgrade to keep recording before then.`
            : `You've used all ${usage.limit} lessons on the ${usage.plan.name} plan this month. ` +
              `Your allowance resets on the 1st — upgrade to keep recording before then.`,
      usage.plan,
      usage.used,
      usage.limit,
    );
  }
  return usage;
}

/**
 * How long a held credit counts. Above the worker's 15-minute platform limit, so
 * a live job never loses its hold; past it, the job is dead whether or not it
 * cleaned up after itself, and its credit is free again.
 */
export const RESERVATION_TTL_MS = 20 * 60 * 1000;

/**
 * Hold one lesson credit for `reservationId` (an upload id, or a one-off id for
 * the synchronous paths), or throw QuotaError if the tutor has none left once
 * finished lessons AND other held credits are counted.
 *
 * Reserving the same id again refreshes its hold instead of taking a second
 * credit, so a resumed or retried upload is never charged twice.
 * `enforce: false` records the hold without checking the limit — for operator
 * recovery, which must work even for a tutor who is at their limit.
 */
export async function reserveLesson(
  tutorId: string,
  reservationId: string,
  { enforce = true }: { enforce?: boolean } = {},
): Promise<void> {
  const { plan, creditsSince } = await tutorPlanRow(tutorId);
  // Settle this month's grant (and any missed ones) before counting against it.
  if (creditsSince) await ensureCreditGrants(tutorId);

  const used =
    plan.lessonWindow === "lifetime"
      ? sql`(select ${tutors.lessonsCreated} from ${tutors} where ${tutors.id} = ${tutorId})`
      : sql`(select count(*) from ${sessions}
             where ${sessions.tutorId} = ${tutorId}
               and ${sessions.createdAt} >= ${windowStart(creditsSince).toISOString()}
               and ${sessions.durationMin} >= ${MIN_COUNTED_LESSON_MIN})`;
  // A subscriber's limit includes what rolled over; everyone else's is the plan's.
  const limit = creditsSince ? currentGrantSql(tutorId) : sql`${plan.lessons}`;
  const held = sql`(select count(*) from ${lessonReservations}
                    where ${lessonReservations.tutorId} = ${tutorId}
                      and ${lessonReservations.uploadId} <> ${reservationId}
                      and ${lessonReservations.createdAt} > now() - make_interval(secs => ${RESERVATION_TTL_MS / 1000}))`;
  const allowed = enforce ? sql`${used} + ${held} < ${limit}` : sql`true`;

  // One transaction (neon-http runs a batch as one). The advisory lock serialises
  // reservations per tutor: in READ COMMITTED each statement takes a fresh
  // snapshot, so the insert below sees every reservation committed before the
  // lock was granted — two concurrent calls can't both take the last credit.
  const [, inserted] = await db.batch([
    db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`lesson-quota:${tutorId}`}, 0))`),
    db.execute(sql`
      insert into ${lessonReservations} (upload_id, tutor_id)
      select ${reservationId}, ${tutorId} where ${allowed}
      on conflict (upload_id) do update set created_at = now()
      returning upload_id`),
  ]);
  if (inserted.rows.length > 0) return;

  // Denied. Say why in the tutor's terms: out of credits, or credits all held by
  // lessons that are still being processed.
  const usage = await lessonUsage(tutorId);
  if (!usage.allowed) await assertLessonQuota(tutorId);
  throw new QuotaError(
    "Your remaining lessons are all being processed right now. " +
      "Try again once they've finished, or upgrade for more lessons.",
    usage.plan,
    usage.used,
    usage.limit,
  );
}

/** Give back a held credit — the attempt failed. Idempotent; never throws. */
export async function releaseLesson(reservationId: string): Promise<void> {
  try {
    await db.delete(lessonReservations).where(eq(lessonReservations.uploadId, reservationId));
  } catch (err) {
    // The TTL frees it anyway; a failed release only delays that.
    console.error(`could not release lesson reservation ${reservationId}:`, err);
  }
}

export type StudentUsage = {
  plan: Plan;
  used: number;
  /** null = unlimited. */
  limit: number | null;
  allowed: boolean;
};

export async function studentUsage(tutorId: string): Promise<StudentUsage> {
  const [plan, [row]] = await Promise.all([
    planOf(tutorId),
    db.select({ n: count() }).from(students).where(eq(students.tutorId, tutorId)),
  ]);

  const used = row?.n ?? 0;
  const limit = plan.students;
  return { plan, used, limit, allowed: limit === null || used < limit };
}

/** Throws QuotaError if this tutor may not add another student profile. */
export async function assertStudentQuota(tutorId: string): Promise<void> {
  const usage = await studentUsage(tutorId);
  if (!usage.allowed && usage.limit !== null) {
    throw new QuotaError(
      (usage.limit === 1
        ? `The ${usage.plan.name} plan includes 1 student profile, and you're already using it. ` +
          `Choose a plan for unlimited students.`
        : `The ${usage.plan.name} plan includes ${usage.limit} student profiles, and you're using all of them. ` +
          `Upgrade for unlimited students, or archive a student you're no longer teaching.`),
      usage.plan,
      usage.used,
      usage.limit,
    );
  }
}
