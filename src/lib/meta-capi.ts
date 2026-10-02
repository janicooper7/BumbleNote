// Meta Conversions API: server-side copies of our conversion events, so ads can
// optimise on sign-ups and payments even when the browser Pixel is blocked.
// Server-only, and Next-free (no `next/*` imports) so the Netlify lesson worker
// can send ActivatedTrial (see src/lib/lessons-core.ts).
//
// Two layers:
//   sendMetaEvent()   — one POST to the Graph API. Never throws; logs and
//                       reports what happened.
//   trackConversion() — the once-only, consent-checked wrapper every caller
//                       uses: claims the event id in meta_events, checks the
//                       tutor's ad consent, sends, records the outcome.
//
// A Meta failure must never break sign-up, a lesson or a payment, so neither
// function throws. Env: META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, and optionally
// META_TEST_EVENT_CODE (routes events to Events Manager → Test events) and
// META_GRAPH_VERSION.

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { metaEvents, tutors } from "@/db/schema";
import { metaEventId } from "@/lib/tracking";

/** Graph API version. v26.0 was current at the time of writing (July 2026). */
const DEFAULT_GRAPH_VERSION = "v26.0";
const TIMEOUT_MS = 5000;

export type MetaUser = {
  email?: string | null;
  /** Our tutor id; hashed, so Meta can join a tutor's events without seeing it. */
  externalId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  /** Two-letter country code. */
  country?: string | null;
};

export type MetaEventName = "Lead" | "CompleteRegistration" | "ActivatedTrial" | "Subscribe" | "Purchase";

export type SendResult = { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; error: string };

/** SHA-256 of the lower-cased, trimmed value, as Meta expects for identifiers. */
export function hashForMeta(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function metaConfig() {
  const pixelId = process.env.META_PIXEL_ID?.trim();
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  if (!pixelId || !token) return null;
  return {
    pixelId,
    token,
    testCode: process.env.META_TEST_EVENT_CODE?.trim() || undefined,
    version: process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
  };
}

/** The user_data block: identifiers hashed, everything absent left out. */
export function userData(user: MetaUser): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  if (user.email) d.em = [hashForMeta(user.email)];
  if (user.externalId) d.external_id = [hashForMeta(user.externalId)];
  if (user.country) d.country = [hashForMeta(user.country)];
  if (user.ip && user.ip !== "unknown") d.client_ip_address = user.ip;
  if (user.userAgent) d.client_user_agent = user.userAgent;
  if (user.fbp) d.fbp = user.fbp;
  if (user.fbc) d.fbc = user.fbc;
  return d;
}

/**
 * POST one event to the Graph API events endpoint. Fire-and-forget: it never
 * throws, and a missing configuration is a skip, not an error.
 */
export async function sendMetaEvent(
  eventName: MetaEventName,
  opts: {
    user: MetaUser;
    customData?: Record<string, unknown>;
    eventId: string;
    eventSourceUrl: string;
    eventTime?: Date;
  },
): Promise<SendResult> {
  const config = metaConfig();
  if (!config) return { status: "skipped", reason: "Meta not configured" };

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor((opts.eventTime ?? new Date()).getTime() / 1000),
        event_id: opts.eventId,
        action_source: "website",
        event_source_url: opts.eventSourceUrl,
        user_data: userData(opts.user),
        ...(opts.customData ? { custom_data: opts.customData } : {}),
      },
    ],
    ...(config.testCode ? { test_event_code: config.testCode } : {}),
    access_token: config.token,
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${config.version}/${config.pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const error = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 500)}`;
      console.error(`[meta] ${eventName} ${opts.eventId} failed: ${error}`);
      return { status: "failed", error };
    }
    console.log(`[meta] ${eventName} ${opts.eventId} sent${config.testCode ? " (test)" : ""}`);
    return { status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[meta] ${eventName} ${opts.eventId} failed: ${error}`);
    return { status: "failed", error };
  }
}

/**
 * Run `send` at most once per event id, recording the outcome in meta_events.
 * The insert is the claim: a retry (a Stripe webhook resent, a second lesson)
 * finds the id taken and sends nothing. Never throws.
 */
async function sendOnce(
  event: { eventId: string; eventName: MetaEventName; tutorId?: string; value?: number; currency?: string },
  send: () => Promise<SendResult>,
): Promise<SendResult | { status: "duplicate" }> {
  try {
    const claimed = await db
      .insert(metaEvents)
      .values({
        eventId: event.eventId,
        tutorId: event.tutorId ?? null,
        eventName: event.eventName,
        value: event.value ?? null,
        currency: event.currency ?? null,
      })
      .onConflictDoNothing({ target: metaEvents.eventId })
      .returning({ eventId: metaEvents.eventId });
    if (!claimed.length) return { status: "duplicate" };

    const result = await send();
    await db
      .update(metaEvents)
      .set({
        status: result.status,
        error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : null,
      })
      .where(eq(metaEvents.eventId, event.eventId));
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[meta] ${event.eventName} ${event.eventId} couldn't be tracked: ${error}`);
    return { status: "failed", error };
  }
}

function withValue(customData: Record<string, unknown> | undefined, value?: number, currency?: string) {
  const d = { ...customData, ...(value !== undefined ? { value, currency: currency ?? "USD" } : {}) };
  return Object.keys(d).length ? d : undefined;
}

/**
 * Send a conversion for a tutor, at most once per event id, and only if they
 * accepted marketing cookies. User details come from the tutor row (email,
 * plus the fbp/fbc/IP/user agent stored with their consent), so this works
 * from the Stripe webhook and the lesson worker, where there's no browser
 * request to read them from. Never throws.
 */
export function trackConversion(opts: {
  eventId: string;
  eventName: MetaEventName;
  tutorId: string;
  eventSourceUrl: string;
  value?: number;
  currency?: string;
  customData?: Record<string, unknown>;
}): Promise<SendResult | { status: "duplicate" }> {
  return sendOnce(opts, async () => {
    const [t] = await db
      .select({
        email: tutors.email,
        adConsent: tutors.adConsent,
        fbp: tutors.metaFbp,
        fbc: tutors.metaFbc,
        ip: tutors.metaClientIp,
        ua: tutors.metaClientUa,
        country: tutors.signupCountry,
      })
      .from(tutors)
      .where(eq(tutors.id, opts.tutorId))
      .limit(1);
    if (!t) return { status: "skipped", reason: "no such tutor" };
    if (t.adConsent !== true) return { status: "skipped", reason: "no marketing consent" };
    return sendMetaEvent(opts.eventName, {
      user: { email: t.email, externalId: opts.tutorId, ip: t.ip, userAgent: t.ua, fbp: t.fbp, fbc: t.fbc, country: t.country },
      customData: withValue(opts.customData, opts.value, opts.currency),
      eventId: opts.eventId,
      eventSourceUrl: opts.eventSourceUrl,
    });
  });
}

/**
 * Send a conversion for someone with no account (a waitlist sign-up), at most
 * once per event id. The caller passes the user details and their consent,
 * read from the request they made. Never throws.
 */
export function trackVisitorConversion(opts: {
  eventId: string;
  eventName: MetaEventName;
  consented: boolean;
  user: MetaUser;
  eventSourceUrl: string;
}): Promise<SendResult | { status: "duplicate" }> {
  return sendOnce(opts, async () => {
    if (!opts.consented) return { status: "skipped", reason: "no marketing consent" };
    return sendMetaEvent(opts.eventName, { user: opts.user, eventId: opts.eventId, eventSourceUrl: opts.eventSourceUrl });
  });
}

/** Public origin for event_source_url, as in src/lib/email.ts. */
export const META_SOURCE_ORIGIN =
  process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://bumblenote.com";

/** ActivatedTrial: a tutor's first lesson written up. Once per tutor, by its event id. */
export function trackActivation(tutorId: string) {
  return trackConversion({
    eventId: metaEventId.activation(tutorId),
    eventName: "ActivatedTrial",
    tutorId,
    eventSourceUrl: `${META_SOURCE_ORIGIN}/dashboard`,
  });
}
