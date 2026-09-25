// Where the error boundaries phone home, so a crash reaches the operator's inbox
// instead of only Netlify's function logs.
//
// The endpoint stays reachable without a session, because most render failures
// happen to visitors who aren't signed in — a crash in the signup or login flow
// is exactly the one nobody is around to report, and requiring auth would
// silence it. But "reachable" is not "trusted", and the two are kept apart:
//
//   Signed-in caller  → channel "system". A tutor with a valid session cookie is
//                       someone we already let run the app; their crash reports
//                       are as trustworthy as our own server-side alerts.
//   Anonymous caller  → channel "untrusted". Same alert, its own small hourly
//                       budget (src/lib/alerts.ts). This is the part that
//                       matters: filling the untrusted budget — deliberately or
//                       by accident — cannot suppress a worker or retention
//                       alert, so nobody can use this endpoint to go quiet.
//
// The rest is ordinary hygiene for untrusted input: the fingerprint is built from
// the path only (validated against a route-shaped pattern) so a caller can't
// rotate a field to slip the per-fingerprint throttle, the message is
// truncated hard, and everything is HTML-escaped at render (see
// sendOperatorAlertEmail).

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { alertOperator } from "@/lib/alerts";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Reject anything that isn't shaped like one of our paths. */
const PATH = /^\/[A-Za-z0-9\-._~/]{0,120}$/;

const clamp = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";

/**
 * Per IP, before anything else. A crash loop in one tab reports a handful of
 * times, not dozens; past that it's a script, and each report costs a session
 * decode and an alert-budget check. The alert budgets already stop the inbox
 * flooding — this stops the function invocations piling up behind them.
 */
const REPORT_LIMIT = { limit: 20, windowSec: 10 * 60 };

export async function POST(req: NextRequest): Promise<Response> {
  // The one non-204: reportClientError fires and forgets and never reads the
  // status, so a 429 can't re-enter the boundary — and Retry-After is there for
  // anything that does read it.
  const limited = await rateLimit({ key: `report-error:ip:${clientIp(req.headers)}`, ...REPORT_LIMIT });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  // Otherwise 204, whatever happens. The caller is an error boundary that has
  // already failed once; a non-2xx here would just make it fail again, and
  // telling an unauthenticated caller why we rejected them helps nobody.
  try {
    const body = (await req.json()) as unknown;
    if (typeof body !== "object" || body === null) return noContent();

    const { digest, message, path, scope } = body as Record<string, unknown>;

    // A digest means the throw happened on the server, where onRequestError
    // (src/instrumentation.ts) has already reported it with the real message —
    // the browser only ever sees the digest. A second email would add nothing.
    if (typeof digest === "string" && digest) return noContent();

    const safePath = clamp(path, 120);
    const route = PATH.test(safePath) ? safePath : "(unrecognised)";
    const where = clamp(scope, 40) || "app";

    // JWT session, so this is a cookie decode rather than a database round-trip
    // (src/auth.ts → session.strategy "jwt").
    const session = await auth();
    const signedIn = !!session?.user?.tutorId;

    // Browsers set this on same-origin fetches; curl and cross-site callers
    // don't. It is trivially forged, so it is NOT the control here — the budget
    // split above is. It just keeps casual drive-by and cross-site noise out of
    // the untrusted budget so a real anonymous crash still has room in it.
    const sameOrigin = req.headers.get("sec-fetch-site") === "same-origin";
    if (!signedIn && !sameOrigin) return noContent();

    await alertOperator({
      channel: signedIn ? "system" : "untrusted",
      subject: `Page crashed: ${route}`,
      summary:
        "An error boundary caught an uncaught exception in the browser — a " +
        "client-side crash. (Server-side ones are reported by the server itself.)",
      // Path only — see the note above on why this ignores the message.
      fingerprint: `client:${where}:${route}`,
      fields: {
        Route: route,
        Boundary: where,
        // Whether the report came from a session, not who — the operator needs
        // to know how much to trust the report, not which tutor crashed.
        Reporter: signedIn ? "signed-in tutor" : "anonymous visitor",
        Message: clamp(message, 300),
      },
    });
  } catch {
    // Malformed JSON, or alerting is off. Nothing to do and nobody to tell.
  }

  return noContent();
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}
