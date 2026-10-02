// The request side of ad tracking: reads consent, Meta's cookies and the
// attribution cookie off the current request, and stores them on the tutor.
// Server-only, and needs a request (next/headers), so it's called from the
// sign-up paths and the Checkout route. The webhook and the lesson worker go
// through src/lib/meta-capi.ts, which works from what's stored here.

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { tutors } from "@/db/schema";
import { META_SOURCE_ORIGIN, trackConversion } from "@/lib/meta-capi";
import { clientIp } from "@/lib/rate-limit";
import {
  ATTRIBUTION_COOKIE,
  CONSENT_COOKIE,
  decodeAttribution,
  fbcFrom,
  metaEventId,
  parseConsent,
  REGISTRATION_EVENT_COOKIE,
  type Attribution,
  type ConsentChoice,
} from "@/lib/tracking";

export type RequestTracking = {
  consent: ConsentChoice | null;
  attribution: Attribution | null;
  fbp: string | null;
  fbc: string | null;
  ip: string;
  userAgent: string | null;
  country: string | null;
};

/** Netlify's two-letter country for the request, if it sent one. */
function countryOf(h: Headers): string | null {
  const direct = h.get("x-country")?.trim();
  if (direct && /^[A-Za-z]{2}$/.test(direct)) return direct.toUpperCase();
  const geo = h.get("x-nf-geo");
  if (!geo) return null;
  try {
    const code = JSON.parse(Buffer.from(geo, "base64").toString("utf8"))?.country?.code;
    return typeof code === "string" && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

export async function readRequestTracking(): Promise<RequestTracking> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  // The attribution cookie is only ever written with consent, but a stale one
  // left from before a withdrawal mustn't be read.
  const attribution = consent === "marketing" ? decodeAttribution(jar.get(ATTRIBUTION_COOKIE)?.value) : null;
  return {
    consent,
    attribution,
    fbp: jar.get("_fbp")?.value ?? null,
    fbc: fbcFrom(jar.get("_fbc")?.value, attribution),
    ip: clientIp(h),
    userAgent: h.get("user-agent"),
    country: countryOf(h),
  };
}

/**
 * The consent columns for a request: what Meta needs while consent is given,
 * and nothing once it's withdrawn. Unknown (no cookie) leaves the stored
 * choice alone, since the tutor may have answered on another device.
 */
function consentColumns(t: RequestTracking): Partial<typeof tutors.$inferInsert> {
  if (t.consent === "marketing") {
    return {
      adConsent: true,
      adConsentAt: new Date(),
      metaFbp: t.fbp,
      metaFbc: t.fbc,
      metaClientIp: t.ip === "unknown" ? null : t.ip,
      metaClientUa: t.userAgent,
    };
  }
  if (t.consent === "essential") {
    return { adConsent: false, adConsentAt: new Date(), metaFbp: null, metaFbc: null, metaClientIp: null, metaClientUa: null };
  }
  return {};
}

/**
 * Everything a brand-new account needs for ad tracking: first-touch
 * attribution and consent onto the row, the event-id cookie for the Pixel's
 * CompleteRegistration, and the server's own CompleteRegistration once the
 * response is out. Never throws: sign-up must not fail over tracking.
 */
export async function recordNewAccount(tutorId: string): Promise<void> {
  try {
    const t = await readRequestTracking();
    const a = t.attribution;
    await db
      .update(tutors)
      .set({
        ...consentColumns(t),
        signupCountry: t.country,
        ...(a
          ? {
              utmSource: a.utm_source ?? null,
              utmMedium: a.utm_medium ?? null,
              utmCampaign: a.utm_campaign ?? null,
              utmContent: a.utm_content ?? null,
              utmTerm: a.utm_term ?? null,
              fbclid: a.fbclid ?? null,
              landingPage: a.landing_page ?? null,
              firstTouchAt: new Date(a.ts),
            }
          : {}),
      })
      // First touch only: a row that already has attribution keeps it.
      .where(and(eq(tutors.id, tutorId), isNull(tutors.firstTouchAt)));

    const eventId = metaEventId.registration(tutorId);
    if (t.consent === "marketing") {
      // Readable by the Pixel (not httpOnly). It holds only the event id.
      (await cookies()).set(REGISTRATION_EVENT_COOKIE, eventId, {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60,
      });
    }

    const send = () =>
      trackConversion({
        eventId,
        eventName: "CompleteRegistration",
        tutorId,
        eventSourceUrl: `${META_SOURCE_ORIGIN}/signup`,
      });
    try {
      after(send);
    } catch {
      await send();
    }
  } catch (err) {
    console.error("[tracking] couldn't record the new account:", err);
  }
}

/**
 * Refresh a tutor's consent and Meta identifiers from the current request.
 * Called when they start Checkout, so the Subscribe event that follows from
 * the webhook carries their latest choice. Never throws.
 */
export async function refreshAdConsent(tutorId: string): Promise<void> {
  try {
    const cols = consentColumns(await readRequestTracking());
    if (Object.keys(cols).length) await db.update(tutors).set(cols).where(eq(tutors.id, tutorId));
  } catch (err) {
    console.error("[tracking] couldn't refresh ad consent:", err);
  }
}
