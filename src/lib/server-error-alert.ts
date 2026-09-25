// Uncaught server errors → operator email. Called by onRequestError in
// src/instrumentation.ts, which Next invokes for every error it catches in a
// server render, route handler, server action or the proxy.
//
// Before this, only code that explicitly called alertOperator (the worker, the
// Stripe webhook, the retention sweep) could reach the inbox. A throw anywhere
// else — say the database call in /api/upload/complete — showed the tutor an
// error and left the operator to find it in the Netlify logs, if ever.
//
// Server render crashes also reach the browser's error boundary, but there the
// message is replaced by an opaque digest. This side has the real error, so it
// owns those reports; /api/report-error drops any report that carries a digest.
//
// Alerts never carry student names or email addresses (see sendOperatorAlertEmail
// in src/lib/email.ts). Server errors are where that is easiest to break by
// accident: a failed Drizzle query's message includes every bound parameter —
// names, emails, whole lesson notes. describeError keeps the SQL and the driver's
// reason and drops the parameters.

import { alertOperator } from "@/lib/alerts";

/** What Next passes as the second and third arguments of onRequestError. */
export type RequestInfo = { path: string; method: string };
export type ErrorContext = { routePath: string; routeType: string };

const EMAIL = /[^\s@'"<>(),;:]+@[^\s@'"<>(),;:]+\.[a-z]{2,}/gi;

/** First line of a message, with parameters and email addresses removed. */
function scrub(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0] ?? "";
  // Drizzle: "Failed query: <sql>\nparams: a,b,c" — first line is already the
  // SQL alone, but some drivers put params inline, so cut at the marker too.
  const noParams = firstLine.split(/\bparams:/i, 1)[0] ?? "";
  return noParams.replace(EMAIL, "[email]").trim();
}

/**
 * A safe, readable account of an error: its name and scrubbed message, plus the
 * underlying cause (which, for a failed query, is Postgres saying why).
 */
export function describeError(err: unknown): { name: string; message: string; cause?: string } {
  if (!(err instanceof Error)) return { name: "NonError", message: scrub(String(err)) };

  let cause: string | undefined;
  if (err.cause instanceof Error) {
    const code = (err.cause as { code?: unknown }).code;
    cause = `${typeof code === "string" ? `[${code}] ` : ""}${scrub(err.cause.message)}`;
  }
  return { name: err.name, message: scrub(err.message), cause };
}

/**
 * Next's control-flow signals (redirect(), notFound(), forbidden(), bailing out
 * to dynamic rendering) are thrown as errors with a recognisable digest. They are
 * how the framework works, not failures.
 */
function isControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(
      digest,
    )
  );
}

/**
 * Identifies the problem, not the occurrence: numbers and quoted values are
 * collapsed, so one broken query hit with a thousand different ids is one alert
 * per throttle window rather than a thousand.
 */
export function fingerprintFor(err: unknown, context: ErrorContext): string {
  const { name, message, cause } = describeError(err);
  const shape = `${message} ${cause ?? ""}`
    .replace(/'[^']*'|"[^"]*"/g, "?")
    .replace(/\d+/g, "#")
    .slice(0, 160);
  return `server:${context.routeType}:${context.routePath}:${name}:${shape}`;
}

export async function alertServerError(
  err: unknown,
  request: RequestInfo,
  context: ErrorContext,
): Promise<void> {
  if (isControlFlow(err)) return;

  const { name, message, cause } = describeError(err);
  const digest = (err as { digest?: unknown } | null)?.digest;

  await alertOperator({
    subject: `Server error: ${context.routeType} ${context.routePath}`,
    summary:
      "An uncaught error reached Next.js on the server. The tutor saw an error " +
      "page or a failed action. The full stack is in the Netlify function logs.",
    fingerprint: fingerprintFor(err, context),
    fields: {
      Kind: context.routeType,
      Route: context.routePath,
      // The path only: a query string can carry anything.
      Request: `${request.method} ${request.path.split("?", 1)[0]}`,
      Error: `${name}: ${message}`,
      Cause: cause,
      Digest: typeof digest === "string" ? digest : undefined,
    },
  });
}
