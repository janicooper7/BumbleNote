// Rate limiting on Postgres — no Redis, no new vendor. Node-only (DB).
//
// A fixed-window counter: each (key, window) pair is one row in `rate_limits`,
// bumped by a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING. It has to be
// one statement — neon-http is a request per query with no interactive
// transactions, so read-then-write would let parallel requests both see
// "under the limit". The upsert makes Postgres serialize them on the row lock.
//
// Fixed windows allow up to 2x the limit across a window boundary. That's fine
// for what this guards (brute force, inbox flooding, runaway clients): the point
// is to cap attempts at "a few dozen an hour", not to meter precisely.
//
// It fails OPEN. A DB blip that also took down login would turn a degraded
// minute into a full outage, and every caller here has a second line of defence
// anyway (slow password hashing, reset-token entropy, the email cooldown).

import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export type RateLimitRule = {
  /** Rule and subject, e.g. `login:ip:${ip}`. Rules must not share a prefix. */
  key: string;
  /** Requests allowed per window, inclusive. */
  limit: number;
  windowSec: number;
};

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the current window rolls over; 0 when `ok`. */
  retryAfterSec: number;
};

/**
 * Stale windows are cleared by whichever request happens to roll this — roughly
 * one in a hundred. Cheaper than a scheduled sweep, and the table only has to be
 * small, not empty. A day's margin comfortably covers the longest window.
 */
const SWEEP_ODDS = 0.01;

/** Count one request against `rule` and say whether it's still allowed. */
export async function rateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
  const windowMs = rule.windowSec * 1000;
  const now = Date.now();
  // Aligned to the epoch rather than to the first request, so every instance
  // lands on the same row without having to agree on anything.
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key: rule.key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    if (Math.random() < SWEEP_ODDS) await sweep();

    if (row.count <= rule.limit) return { ok: true, retryAfterSec: 0 };
    const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  } catch (error) {
    console.error("[rate-limit] check failed, allowing request", rule.key, error);
    return { ok: true, retryAfterSec: 0 };
  }
}

/**
 * Check several rules at once (say, per IP and per email). Every rule is counted
 * even when an earlier one already refuses — otherwise hammering one key would
 * cost nothing against the others. Blocked if any rule is; the wait is the
 * longest of the refusing ones, since that's when a retry can actually succeed.
 */
export async function rateLimitAll(rules: RateLimitRule[]): Promise<RateLimitResult> {
  const results = await Promise.all(rules.map(rateLimit));
  const blocked = results.filter((r) => !r.ok);
  if (!blocked.length) return { ok: true, retryAfterSec: 0 };
  return { ok: false, retryAfterSec: Math.max(...blocked.map((r) => r.retryAfterSec)) };
}

async function sweep(): Promise<void> {
  try {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`));
  } catch (error) {
    // Housekeeping only — the next roll will try again.
    console.error("[rate-limit] sweep failed", error);
  }
}

/**
 * The caller's IP, from whichever headers object is at hand: `req.headers` in a
 * route handler, `await headers()` in a server action (async since Next 15).
 *
 * On Netlify `x-nf-client-connection-ip` is set by the edge and can't be forged
 * by the client, so it wins. `x-forwarded-for` is only the fallback for other
 * hosts and local dev — its first entry is whatever the client claims, so off
 * Netlify an attacker could rotate it to dodge per-IP limits. "unknown" puts
 * everyone without either header in one shared bucket, which only happens in dev.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const netlify = headers.get("x-nf-client-connection-ip")?.trim();
  if (netlify) return netlify;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/** "a minute" / "5 minutes" — for "try again in …" copy. Rounds up. */
export function waitText(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

/** The 429 a route handler sends back, with Retry-After so clients can pace. */
export function tooManyRequests(
  retryAfterSec: number,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSec) } },
  );
}
