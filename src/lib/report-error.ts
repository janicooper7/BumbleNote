// Client half of the crash reporting — POSTs to /api/report-error, which emails
// the operator (src/app/api/report-error/route.ts).
//
// Called from the error boundaries' effects. Three things matter here:
//
//   - It can never throw or reject. A reporter that fails inside an error
//     boundary re-enters the boundary, and the page ends up in a loop.
//   - `keepalive` lets the request outlive the page. Someone who hits a crash
//     and immediately closes the tab is exactly the report worth keeping.
//   - It stays quiet in development, where crashes are expected and the fix is
//     already on screen.

export function reportClientError(args: {
  scope: string;
  error: Error & { digest?: string };
}): void {
  if (process.env.NODE_ENV !== "production") return;

  try {
    void fetch("/api/report-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        scope: args.scope,
        path: window.location.pathname,
        digest: args.error.digest,
        message: args.error.message,
      }),
    }).catch(() => {});
  } catch {
    // Older browsers reject `keepalive`, JSON.stringify can choke on an exotic
    // error object — either way, dropping the report is the correct outcome.
  }
}
