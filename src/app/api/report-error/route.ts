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
// rotate a field to slip the per-fingerprint throttle, digest and message are
// truncated hard, and everything is HTML-escaped at render (see
// sendOperatorAlertEmail).

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { alertOperator } from "@/lib/alerts";

/** Reject anything that isn't shaped like one of our paths. */
const PATH = /^\/[A-Za-z0-9\-._~/]{0,120}$/;

const clamp = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";

export async function POST(req: NextRequest): Promise<Response> {
  // Always 204, whatever happens. The caller is an error boundary that has
  // already failed once; a non-2xx here would just make it fail again, and
  // telling an unauthenticated caller why we rejected them helps nobody.
  try {
    const body = (await req.json()) as unknown;
    if (typeof body !== "object" || body === null) return noContent();

    const { digest, message, path, scope } = body as Record<string, unknown>;

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
        "An error boundary caught an uncaught exception in the browser. If a " +
        "digest is shown below, the throw happened during a server render and " +
        "the full stack is in the Netlify function logs under that digest.",
      // Path only — see the note above on why this ignores digest and message.
      fingerprint: `client:${where}:${route}`,
      fields: {
        Route: route,
        Boundary: where,
        // Whether the report came from a session, not who — the operator needs
        // to know how much to trust the report, not which tutor crashed.
        Reporter: signedIn ? "signed-in tutor" : "anonymous visitor",
        Digest: clamp(digest, 64),
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
