// Next.js instrumentation hook — see src/lib/server-error-alert.ts.

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Alerting uses node:crypto and Netlify Blobs. Imported lazily, and only on
  // the Node runtime, so none of it is pulled into an edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Quiet in development, like the browser half (src/lib/report-error.ts):
  // errors there are expected, already on screen, and would flood the inbox.
  if (process.env.NODE_ENV !== "production") return;

  try {
    const { alertServerError } = await import("@/lib/server-error-alert");
    await alertServerError(err, request, context);
  } catch (e) {
    // Reporting a failure must never become a second one.
    console.error("[instrumentation] could not report server error:", e);
  }
};
