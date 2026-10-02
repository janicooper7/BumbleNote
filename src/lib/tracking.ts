// Consent and first-touch attribution: the cookie names and formats shared by
// the browser (src/components/tracking) and the server (src/lib/tracking-server.ts,
// src/lib/meta-capi.ts). No Node or Next imports, so both sides can use it.
//
// One optional category, "marketing", covers everything that isn't strictly
// necessary: the Meta Pixel, the attribution cookie and server-side Meta
// events. Nothing in that category runs until the visitor accepts it.

/** The visitor's choice: "marketing" (accepted) or "essential" (declined). */
export const CONSENT_COOKIE = "bn_consent";
export type ConsentChoice = "marketing" | "essential";
/** Six months, then we ask again. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

export function parseConsent(raw: string | null | undefined): ConsentChoice | null {
  return raw === "marketing" || raw === "essential" ? raw : null;
}

/** First-touch attribution, set on the first consented visit and never overwritten. */
export const ATTRIBUTION_COOKIE = "bn_attr";
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * The event id of a brand-new account's CompleteRegistration. The server sets
 * this cookie when it creates the account; the Pixel sends its own copy with
 * the same id (so Meta counts one sign-up, not two), then deletes the cookie.
 */
export const REGISTRATION_EVENT_COOKIE = "bn_reg_event";

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  /** Path and query of the first page, e.g. "/?utm_source=facebook". */
  landing_page?: string;
  /** When they first landed, in ms since the epoch. */
  ts: number;
};

const MAX_VALUE = 200;
const MAX_LANDING = 500;

function clean(v: unknown, max = MAX_VALUE): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

/** The attribution for a visit landing on `url`. */
export function attributionFromUrl(url: URL, now = Date.now()): Attribution {
  const a: Attribution = { ts: now };
  for (const k of UTM_KEYS) a[k] = clean(url.searchParams.get(k));
  a.fbclid = clean(url.searchParams.get("fbclid"));
  a.landing_page = clean(url.pathname + url.search, MAX_LANDING);
  return a;
}

export function encodeAttribution(a: Attribution): string {
  return encodeURIComponent(JSON.stringify(a));
}

/** The cookie's value, validated; null if it's missing or not ours. */
export function decodeAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : null;
  if (ts === null) return null;
  const a: Attribution = { ts };
  for (const k of UTM_KEYS) a[k] = clean(o[k]);
  a.fbclid = clean(o.fbclid);
  a.landing_page = clean(o.landing_page, MAX_LANDING);
  return a;
}

/**
 * Meta's click id in its `fbc` format: the Pixel's own _fbc cookie when there
 * is one, otherwise built from the fbclid we captured on landing.
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
 */
export function fbcFrom(fbcCookie: string | null | undefined, attribution: Attribution | null): string | null {
  if (fbcCookie?.startsWith("fb.")) return fbcCookie;
  if (attribution?.fbclid) return `fb.1.${attribution.ts}.${attribution.fbclid}`;
  return null;
}

/** Event ids, shared by the Pixel and the Conversions API so Meta de-duplicates them. */
export const metaEventId = {
  lead: (waitlistId: string) => `lead-${waitlistId}`,
  registration: (tutorId: string) => `reg-${tutorId}`,
  activation: (tutorId: string) => `activated-${tutorId}`,
  subscribe: (subscriptionId: string) => `subscribe-${subscriptionId}`,
  purchase: (checkoutSessionId: string) => `purchase-${checkoutSessionId}`,
};
