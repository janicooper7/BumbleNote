// Launch-sequence emails 2–5: who gets each one, and when. Server-only (DB).
// The messages themselves are built in src/lib/email.ts; email 1 (the waitlist
// welcome) lives in src/lib/waitlist-welcome.ts.
//
//   2  We're live       whole waitlist          launch, Sun 4 Oct 2026 9am UK
//   3  Why tutors use it waitlist, no account   Fri 9 Oct 2026 9am UK
//   4  Welcome          every new account       on first sign-in
//   5  Trial finished   free plan, trial used   1 hour after the 2nd lesson
//
// netlify/functions/lifecycle-emails.mts runs runLifecycleEmails() every five
// minutes; email 4 is also sent straight from sign-in (src/auth.ts), and the
// sweep only catches any that send missed. scripts/send-lifecycle-email.ts is
// the manual fallback and preview tool.
//
// Each email has a *_sent_at column. A row is claimed (column set where it was
// null) before its email is sent, so overlapping runs can't double-send. If the
// send request fails outright the claim is released and the next run retries;
// an address Resend refuses on its own stays claimed (retrying won't help) and
// is reported instead.

import { and, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  accountWelcomeEmail,
  launchBenefitsEmail,
  launchLiveEmail,
  sendLifecycleBatch,
  trialEndedEmail,
  type LifecycleEmail,
} from "./email";
import { MIN_COUNTED_LESSON_MIN, PLANS } from "./plans";
import { unsubscribeUrl as waitlistUnsubscribeUrl } from "./waitlist-welcome";

const { waitlist, tutors, sessions } = schema;

/** Sunday 4 October 2026, 9:00am BST. */
export const LAUNCH_AT = new Date("2026-10-04T08:00:00Z");
/** Friday 9 October 2026, 9:00am BST. */
export const BENEFITS_AT = new Date("2026-10-09T08:00:00Z");
/**
 * How long after its send time a waitlist email keeps going out to anyone the
 * first run missed. A day, so a failed 9am run is retried all morning, but a
 * stray run weeks later doesn't mail the list again.
 */
const CAMPAIGN_WINDOW_MS = 24 * 60 * 60 * 1000;
/** The sweeps only look this far back, so one address that keeps failing isn't retried forever. */
const SWEEP_LOOKBACK = "2 days";
const TRIAL_ENDED_DELAY = "1 hour";

const BATCH = 100;
/** Batches per kind per run: 1,000 emails, well inside a scheduled function's 30s. */
const MAX_BATCHES = 10;

/** Public origin for links in emails, as in src/lib/email.ts. */
const PUBLIC_ORIGIN =
  process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://bumblenote.com";

/** Unsubscribe link for tutor emails, keyed on tutors.email_token. */
export function tutorUnsubscribeUrl(token: string): string {
  return `${PUBLIC_ORIGIN}/api/email/unsubscribe?${new URLSearchParams({ token })}`;
}

export type SendOutcome = { kind: string; sent: number; rejected: string[]; failed: string | null };

type Claimed = { id: string; email: string };

/**
 * Claim up to 100 rows at a time and send them, until none are left. `claim`
 * must set the row's sent-at column and return what it claimed; `release`
 * clears it again.
 */
async function claimAndSend<R extends Claimed>(opts: {
  kind: string;
  claim: () => Promise<R[]>;
  build: (row: R) => LifecycleEmail;
  release: (ids: string[]) => Promise<unknown>;
}): Promise<SendOutcome> {
  const outcome: SendOutcome = { kind: opts.kind, sent: 0, rejected: [], failed: null };
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await opts.claim();
    if (!rows.length) break;
    try {
      const { rejected } = await sendLifecycleBatch(opts.kind, rows.map(opts.build));
      outcome.sent += rows.length - rejected.length;
      for (const r of rejected) outcome.rejected.push(`${rows[r.index]?.email}: ${r.message}`);
    } catch (err) {
      await opts.release(rows.map((r) => r.id));
      outcome.failed = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  return outcome;
}

type WaitlistColumn = "liveSentAt" | "benefitsSentAt";

/** Claim waitlist rows for `column`, among those matching `where`. */
function claimWaitlist(column: WaitlistColumn, where: SQL | undefined) {
  return () =>
    db
      .update(waitlist)
      .set({ [column]: new Date() })
      .where(
        inArray(
          waitlist.id,
          db
            .select({ id: waitlist.id })
            .from(waitlist)
            .where(and(isNull(waitlist[column]), where))
            .orderBy(waitlist.createdAt)
            .limit(BATCH),
        ),
      )
      .returning({ id: waitlist.id, email: waitlist.email });
}

function releaseWaitlist(column: WaitlistColumn) {
  return (ids: string[]) => db.update(waitlist).set({ [column]: null }).where(inArray(waitlist.id, ids));
}

/** Waitlist addresses with no BumbleNote account. Emails are stored lowercase there, not always in tutors. */
const hasNoAccount = sql`not exists (select 1 from ${tutors} where lower(${tutors.email}) = ${waitlist.email})`;

/** Email 2: everyone on the waitlist. */
export function sendLaunchLive(): Promise<SendOutcome> {
  return claimAndSend({
    kind: "launch-live",
    claim: claimWaitlist("liveSentAt", undefined),
    build: (r) => launchLiveEmail(r.email, waitlistUnsubscribeUrl(r.id)),
    release: releaseWaitlist("liveSentAt"),
  });
}

/** Email 3: waitlist addresses that haven't created an account. */
export function sendLaunchBenefits(): Promise<SendOutcome> {
  return claimAndSend({
    kind: "launch-benefits",
    claim: claimWaitlist("benefitsSentAt", hasNoAccount),
    build: (r) => launchBenefitsEmail(r.email, waitlistUnsubscribeUrl(r.id)),
    release: releaseWaitlist("benefitsSentAt"),
  });
}

type TutorClaimed = Claimed & { firstName: string | null; name: string; emailToken: string };

const tutorReturning = {
  id: tutors.id,
  email: tutors.email,
  firstName: tutors.firstName,
  name: tutors.name,
  emailToken: tutors.emailToken,
};

/** The account's first name, or null to fall back to "busy-bee". */
function firstNameOf(t: TutorClaimed): string | null {
  if (t.firstName?.trim()) return t.firstName.trim();
  // Google accounts only have `name`, which falls back to the email address.
  const first = t.name.trim().split(/\s+/)[0];
  return first && !first.includes("@") ? first : null;
}

function claimTutors(column: "welcomeSentAt" | "trialEndedSentAt", where: SQL | undefined) {
  return (): Promise<TutorClaimed[]> =>
    db
      .update(tutors)
      .set({ [column]: new Date() })
      .where(
        inArray(
          tutors.id,
          db
            .select({ id: tutors.id })
            .from(tutors)
            .where(and(isNull(tutors[column]), where))
            .orderBy(tutors.createdAt)
            .limit(BATCH),
        ),
      )
      .returning(tutorReturning);
}

function releaseTutors(column: "welcomeSentAt" | "trialEndedSentAt") {
  return (ids: string[]) => db.update(tutors).set({ [column]: null }).where(inArray(tutors.id, ids));
}

/** Email 4 for one tutor, straight after sign-in. A no-op if they've had it. */
export function sendAccountWelcome(tutorId: string): Promise<SendOutcome> {
  return claimAndSend({
    kind: "account-welcome",
    // Exactly one row, once: a second batch finds it already claimed.
    claim: claimTutors("welcomeSentAt", eq(tutors.id, tutorId)),
    build: (t) => accountWelcomeEmail(t.email, firstNameOf(t), tutorUnsubscribeUrl(t.emailToken)),
    release: releaseTutors("welcomeSentAt"),
  });
}

/** Email 4 for recent accounts the sign-in send missed. */
export function sweepAccountWelcomes(): Promise<SendOutcome> {
  return claimAndSend({
    kind: "account-welcome",
    claim: claimTutors("welcomeSentAt", gte(tutors.createdAt, sql`now() - interval '${sql.raw(SWEEP_LOOKBACK)}'`)),
    build: (t) => accountWelcomeEmail(t.email, firstNameOf(t), tutorUnsubscribeUrl(t.emailToken)),
    release: releaseTutors("welcomeSentAt"),
  });
}

/**
 * Email 5: free-plan tutors who have used the trial, an hour after the lesson
 * that used it up. "That lesson" is their latest one long enough to count; the
 * lookback keeps tutors who used their trial long ago out of it.
 */
export function sweepTrialEnded(): Promise<SendOutcome> {
  const lastCounted = sql`(select max(${sessions.createdAt}) from ${sessions}
    where ${sessions.tutorId} = ${tutors.id} and ${sessions.durationMin} >= ${MIN_COUNTED_LESSON_MIN})`;
  return claimAndSend({
    kind: "trial-ended",
    claim: claimTutors(
      "trialEndedSentAt",
      and(
        eq(tutors.plan, "free"),
        gte(tutors.lessonsCreated, PLANS.free.lessons),
        isNull(tutors.marketingOptOutAt),
        lte(lastCounted, sql`now() - interval '${sql.raw(TRIAL_ENDED_DELAY)}'`),
        gte(lastCounted, sql`now() - interval '${sql.raw(SWEEP_LOOKBACK)}'`),
      ),
    ),
    build: (t) => trialEndedEmail(t.email, firstNameOf(t), tutorUnsubscribeUrl(t.emailToken)),
    release: releaseTutors("trialEndedSentAt"),
  });
}

function due(at: Date, now: Date): boolean {
  const since = now.getTime() - at.getTime();
  return since >= 0 && since < CAMPAIGN_WINDOW_MS;
}

/** Everything that's due right now. Each kind runs on its own, so one failing doesn't stop the rest. */
export async function runLifecycleEmails(now = new Date()): Promise<SendOutcome[]> {
  const jobs: [string, () => Promise<SendOutcome>][] = [
    ["account-welcome", sweepAccountWelcomes],
    ["trial-ended", sweepTrialEnded],
  ];
  if (due(LAUNCH_AT, now)) jobs.push(["launch-live", sendLaunchLive]);
  if (due(BENEFITS_AT, now)) jobs.push(["launch-benefits", sendLaunchBenefits]);

  const outcomes: SendOutcome[] = [];
  for (const [kind, job] of jobs) {
    try {
      outcomes.push(await job());
    } catch (err) {
      outcomes.push({ kind, sent: 0, rejected: [], failed: err instanceof Error ? err.message : String(err) });
    }
  }
  return outcomes;
}

/** Waitlist addresses still due each campaign, for the script's dry run. */
export async function countWaitlistPending(): Promise<{ live: number; benefits: number }> {
  const [row] = await db
    .select({
      live: sql<number>`count(*) filter (where ${waitlist.liveSentAt} is null)::int`,
      benefits: sql<number>`count(*) filter (where ${waitlist.benefitsSentAt} is null and ${hasNoAccount})::int`,
    })
    .from(waitlist);
  return row ?? { live: 0, benefits: 0 };
}

/** Opt a tutor out of the sequence emails (4 and 5), by their unsubscribe token. */
export async function optOutTutor(token: string): Promise<void> {
  await db
    .update(tutors)
    .set({ marketingOptOutAt: new Date() })
    .where(and(eq(tutors.emailToken, token), isNull(tutors.marketingOptOutAt)));
}
