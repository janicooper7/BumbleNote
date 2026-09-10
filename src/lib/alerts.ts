// Operator alerting: "tell me by email when something breaks".
//
// Everything in here obeys three rules, because an alerting system that breaks
// the app it watches is worse than no alerting at all:
//
//   1. NEVER THROW. Every path is caught. `alertOperator` returns void and is
//      always safe to call from inside a catch block — including the catch that
//      is already handling the real failure.
//   2. NEVER BLOCK THE FIX. It's awaited by callers that can spare the ~200ms,
//      but nothing downstream depends on its result.
//   3. NEVER FLOOD. A broken deploy fails every request; without throttling that
//      is thousands of identical emails, a burned Resend quota, and a mailbox so
//      noisy the one alert that mattered gets missed. See THROTTLE_MS below.
//
// Alerts carry opaque ids, never student names or email addresses — see the note
// on sendOperatorAlertEmail in src/lib/email.ts.

import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { sendOperatorAlertEmail } from "./email";
import { env } from "./env";

/** Blob store for the throttle bookkeeping. Separate from the upload store. */
const ALERT_STORE = "operator-alerts";

/**
 * How long one distinct alert stays quiet after firing.
 *
 * Long enough that a hard outage sends a handful of emails an hour rather than
 * one per request, short enough that a problem which is still happening keeps
 * saying so. Distinctness is per fingerprint (see `fingerprintOf`), so a second,
 * unrelated failure still gets through immediately.
 */
const THROTTLE_MS = 15 * 60 * 1000;

/**
 * Which budget an alert draws on. This split is a security boundary, not
 * bookkeeping.
 *
 * A single shared ceiling looks like flood protection but is really a way to
 * silence the alerts that matter: anyone who can reach an unauthenticated
 * reporting endpoint could spend the hour's budget on junk and keep it spent, so
 * a genuine worker or retention failure in that window would be suppressed and
 * never reach the inbox. Denial of visibility, not just noise.
 *
 * So anything an untrusted caller can trigger draws on its own small budget.
 * Exhausting it — deliberately or otherwise — cannot suppress a "system" alert.
 *
 *   system    — raised by our own server code: the background worker, the
 *               retention sweep, crashes reported by a signed-in tutor.
 *   untrusted — raised by input from an unauthenticated caller.
 */
export type AlertChannel = "system" | "untrusted";

/**
 * Hourly ceiling per channel, on top of the per-fingerprint throttle.
 *
 * `system` is generous, because a real and varied outage should still get
 * through. `untrusted` is deliberately tiny: an anonymous visitor hitting a
 * broken public page is worth hearing about once or twice an hour, and nothing
 * more than that is worth the risk of the channel being abused.
 */
const HOURLY_BUDGET: Record<AlertChannel, number> = {
  system: 20,
  untrusted: 3,
};

/** Blob keys for the counters. Not fingerprints, hence the prefix. */
const budgetKey = (channel: AlertChannel) => `__budget:${channel}`;

/**
 * Per-instance throttle, checked before the blob round-trip.
 *
 * The blob store is the real cross-instance record, but a tight failure loop can
 * fire again before the first write lands. This catches that without a network
 * hop. It dies with the instance, which is fine — the blob layer outlives it.
 */
const recentlySent = new Map<string, number>();

export type AlertFields = Record<string, string | number | undefined | null>;

/**
 * Email the operator that something went wrong. Safe to call from anywhere,
 * including a catch block; failures are logged and swallowed.
 *
 * `fingerprint` decides what counts as "the same alert" for throttling. Pass one
 * that identifies the *problem*, not the occurrence — including a lesson id or a
 * timestamp would defeat the throttle by making every occurrence unique.
 */
export async function alertOperator(args: {
  subject: string;
  summary: string;
  fingerprint: string;
  fields?: AlertFields;
  /** Defaults to "system" — only callers handling untrusted input pass otherwise. */
  channel?: AlertChannel;
}): Promise<void> {
  try {
    const to = env.ALERT_EMAIL;
    if (!to) return; // alerting not configured — see ALERT_EMAIL in .env.example

    const key = fingerprintOf(args.fingerprint);
    if (await isThrottled(key)) return;
    if (await overBudget(args.channel ?? "system")) return;

    await sendOperatorAlertEmail({
      to,
      subject: args.subject,
      summary: args.summary,
      fields: presentable(args.fields),
    });

    await markSent(key);
  } catch (err) {
    // The one place this must not escalate. If we can't report the problem, the
    // log is the fallback — the caller is usually mid-way through handling a
    // failure of its own and must not inherit ours.
    console.error("[alerts] could not send operator alert:", err);
  }
}

/** Stable, filename-safe key for a fingerprint. */
function fingerprintOf(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/** Drop empty values and stringify the rest, so the email has no blank rows. */
function presentable(fields: AlertFields | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    // Truncate: an upstream error body can be enormous, and nobody reads past
    // the first couple of lines on a phone anyway.
    out[key] = String(value).slice(0, 600);
  }
  out["Sent"] = new Date().toISOString();
  return out;
}

async function isThrottled(key: string): Promise<boolean> {
  const now = Date.now();

  const local = recentlySent.get(key);
  if (local && now - local < THROTTLE_MS) return true;
  // Claim the slot locally *before* the await, so concurrent invocations in this
  // instance don't all get through while the blob read is in flight.
  recentlySent.set(key, now);

  const store = alertStore();
  if (!store) return false; // no store (local dev) — in-memory throttle only

  try {
    const last = (await store.get(key, { type: "json" })) as { at: number } | null;
    return !!last && now - last.at < THROTTLE_MS;
  } catch {
    // A throttle we can't read is not a reason to stay silent about an outage.
    return false;
  }
}

/**
 * True once this hour's alert budget is spent. Best-effort: concurrent callers
 * can race the read-modify-write and slip an extra email or two through, which
 * is the right trade for a safety valve that must never block on a lock.
 */
async function overBudget(channel: AlertChannel): Promise<boolean> {
  const store = alertStore();
  if (!store) return false;

  const max = HOURLY_BUDGET[channel];
  const key = budgetKey(channel);

  try {
    const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    const budget = (await store.get(key, { type: "json" })) as {
      hourStart: number;
      count: number;
    } | null;

    const count = budget && budget.hourStart === hourStart ? budget.count : 0;
    if (count >= max) {
      console.warn(
        `[alerts] hourly ${channel} budget of ${max} spent — alert suppressed`,
      );
      return true;
    }

    await store.setJSON(key, { hourStart, count: count + 1 });
    return false;
  } catch {
    return false;
  }
}

async function markSent(key: string): Promise<void> {
  const store = alertStore();
  if (!store) return;
  try {
    await store.setJSON(key, { at: Date.now() });
  } catch {
    // Worst case the next occurrence sends a second email. Acceptable.
  }
}

/**
 * The blob store, or null where blobs aren't available.
 *
 * `getStore` throws under a plain `next dev` (Netlify Blobs needs a linked site
 * or `netlify dev`), and alerting must not be what breaks local development.
 */
function alertStore(): ReturnType<typeof getStore> | null {
  try {
    return getStore(ALERT_STORE);
  } catch {
    return null;
  }
}
