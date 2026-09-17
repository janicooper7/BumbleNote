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
//
// It is deliberately NOT enforced inside createDraftLessonCore(). By the time
// that runs the money is already spent: rejecting there would bin a lesson the
// tutor just taught AND leave us holding the bill. Capping the row count after
// the fact protects nobody. The two entry points above are the complete set of
// callers that reach paid work, so guarding them bounds the spend exactly.
//
// Monthly plans count per calendar month (UTC) from `sessions.created_at` — when
// we did the work, not the lesson's nominal date, which the tutor can edit. The
// free trial is lifetime and counts `tutors.lessons_created` instead, which
// deleting a lesson doesn't lower.
//
// Either way only lessons of MIN_COUNTED_LESSON_MIN or longer count, so a call
// that drops a few minutes in doesn't cost a credit. Starting a recording still
// needs a credit left — the length isn't known until it's over.

import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { sessions, students, tutors } from "@/db/schema";
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
function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function tutorPlanRow(tutorId: string) {
  const [row] = await db
    .select({ plan: tutors.plan, lessonsCreated: tutors.lessonsCreated })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  return { plan: planFor(row?.plan), lessonsCreated: row?.lessonsCreated ?? 0 };
}

async function planOf(tutorId: string): Promise<Plan> {
  return (await tutorPlanRow(tutorId)).plan;
}

export type LessonUsage = {
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
};

/** How many lessons this tutor has used in their plan's window, against its limit. */
export async function lessonUsage(tutorId: string): Promise<LessonUsage> {
  const { plan, lessonsCreated } = await tutorPlanRow(tutorId);

  let used = lessonsCreated;
  if (plan.lessonWindow === "month") {
    const [row] = await db
      .select({ n: count() })
      .from(sessions)
      .where(
        and(
          eq(sessions.tutorId, tutorId),
          gte(sessions.createdAt, monthStart()),
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
  };
}

/** Throws QuotaError if this tutor may not process another lesson. */
export async function assertLessonQuota(tutorId: string): Promise<LessonUsage> {
  const usage = await lessonUsage(tutorId);
  if (!usage.allowed) {
    throw new QuotaError(
      usage.plan.lessonWindow === "lifetime"
        ? `You've used your ${usage.limit} free trial lessons. Choose a plan to keep recording lessons.`
        : `You've used all ${usage.limit} lessons on the ${usage.plan.name} plan this month. ` +
            `Your allowance resets on the 1st — upgrade to keep recording before then.`,
      usage.plan,
      usage.used,
      usage.limit,
    );
  }
  return usage;
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
