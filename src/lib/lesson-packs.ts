// Extra lesson packs: one-off purchases of 10/20/30 lessons on top of a
// subscriber's monthly allowance. Server-only.
//
// HOW A PACK IS SPENT: the plan's own lessons always go first. Within each lesson
// period (src/lib/credits.ts), the lessons past that period's allowance
// (lessons + carried_in) are drawn from packs, each from the valid pack that
// expires soonest. So a pack is only ever touched in a month the tutor ran out,
// and never feeds rollover: the period's leftover is already zero by then.
//
// Nothing records "used" on a pack. The balance is replayed from the counted
// lessons each time (packBalance), the same way credits.ts derives a period's
// usage from `sessions`. It's deterministic, needs no write when a lesson is
// made, and can't drift from the lessons actually taught. The replay only covers
// the periods since the tutor's first pack, and tutors without packs cost one
// indexed read.
//
// Packs are for subscribers: they need a live paid subscription to buy
// (lessonPackCheckoutUrl) and to use (quota.ts only adds them to a period's
// limit). They last PACK_VALID_MONTHS from purchase.

import { and, asc, eq, gte, lt } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { creditGrants, lessonPacks, sessions } from "@/db/schema";
import { addMonths, type CreditPeriod } from "@/lib/credits";
import { MIN_COUNTED_LESSON_MIN } from "@/lib/plans";
import { lessonPackFor } from "@/lib/pricing";

export const PACK_VALID_MONTHS = 3;

export type PackBalance = {
  /** Pack lessons still available now, across every valid pack. */
  remaining: number;
  /** Pack lessons already spent in the current period. */
  usedThisPeriod: number;
  /** When the soonest-expiring pack with lessons left runs out; null if none. */
  nextExpiry: Date | null;
};

const EMPTY: PackBalance = { remaining: 0, usedThisPeriod: 0, nextExpiry: null };

type Pack = { lessons: number; purchasedAt: Date; expiresAt: Date; used: number };

/**
 * Replay which lessons each pack paid for, and what's left. `period` is the
 * tutor's current lesson period (ensureCreditGrants), so its row is settled.
 */
export async function packBalance(tutorId: string, period: CreditPeriod, now = new Date()): Promise<PackBalance> {
  const rows = await db
    .select({ lessons: lessonPacks.lessons, purchasedAt: lessonPacks.purchasedAt, expiresAt: lessonPacks.expiresAt })
    .from(lessonPacks)
    .where(eq(lessonPacks.tutorId, tutorId))
    .orderBy(asc(lessonPacks.expiresAt), asc(lessonPacks.purchasedAt));
  if (!rows.length) return EMPTY;
  const packs: Pack[] = rows.map((r) => ({ ...r, used: 0 }));
  const firstPurchase = packs.reduce((min, p) => (p.purchasedAt < min ? p.purchasedAt : min), packs[0].purchasedAt);

  // Every period that could have spent a pack: the one the first purchase fell
  // in, and each since. A period runs until the next row's start; the current
  // one until now.
  const grants = await db
    .select({ start: creditGrants.periodStart, lessons: creditGrants.lessons, carriedIn: creditGrants.carriedIn })
    .from(creditGrants)
    .where(eq(creditGrants.tutorId, tutorId))
    .orderBy(asc(creditGrants.periodStart));
  const firstIdx = Math.max(0, grants.findLastIndex((g) => g.start <= firstPurchase));
  const periods = grants.slice(firstIdx).map((g, i, all) => ({
    ...g,
    end: all[i + 1]?.start ?? now,
  }));
  if (!periods.length) return EMPTY;

  const taught = await db
    .select({ at: sessions.createdAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.tutorId, tutorId),
        gte(sessions.createdAt, periods[0].start),
        lt(sessions.createdAt, now),
        gte(sessions.durationMin, MIN_COUNTED_LESSON_MIN),
      ),
    )
    .orderBy(asc(sessions.createdAt));

  let usedThisPeriod = 0;
  for (const p of periods) {
    const inPeriod = taught.filter((l) => l.at >= p.start && l.at < p.end);
    // The allowance pays for the first lessons of the period; the rest are packs'.
    for (const lesson of inPeriod.slice(p.lessons + p.carriedIn)) {
      const pack = packs.find((k) => k.purchasedAt <= lesson.at && lesson.at < k.expiresAt && k.used < k.lessons);
      // None: a lesson let through without a credit (operator recovery, or a
      // reservation that outlived its pack by a few minutes). Nothing to charge.
      if (!pack) continue;
      pack.used++;
      if (p.start >= period.start) usedThisPeriod++;
    }
  }

  const live = packs.filter((k) => k.expiresAt > now && k.used < k.lessons);
  return {
    remaining: live.reduce((sum, k) => sum + k.lessons - k.used, 0),
    usedThisPeriod,
    nextExpiry: live[0]?.expiresAt ?? null,
  };
}

/**
 * Record a paid pack Checkout. Idempotent on the session id: the webhook and the
 * checkout return both call it, and Stripe retries webhooks. Returns false for a
 * session that isn't a paid pack of ours, which callers ignore.
 */
export async function grantLessonPack(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.mode !== "payment" || session.metadata?.kind !== "lesson_pack") return false;
  // Bank transfers and the like complete the session before the money arrives.
  // Cards (all Checkout offers here) are "paid" on completion.
  if (session.payment_status !== "paid") return false;
  const tutorId = session.metadata.tutorId ?? session.client_reference_id;
  const pack = lessonPackFor(session.metadata.lessons);
  if (!tutorId || !pack) throw new Error(`Lesson pack session ${session.id} is missing its tutor or pack size.`);

  const purchasedAt = new Date(session.created * 1000);
  await db
    .insert(lessonPacks)
    .values({
      tutorId,
      lessons: pack.lessons,
      purchasedAt,
      expiresAt: addMonths(purchasedAt, PACK_VALID_MONTHS),
      stripeSessionId: session.id,
      amountCents: session.amount_total ?? 0,
    })
    .onConflictDoNothing({ target: lessonPacks.stripeSessionId });
  return true;
}
