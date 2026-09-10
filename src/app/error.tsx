"use client";

// Root error boundary — catches uncaught exceptions from any route that doesn't
// have a closer boundary of its own (see src/app/dashboard/error.tsx).
//
// Next 16 hands the retry callback as `unstable_retry`, not the `reset` of
// earlier versions (node_modules/next/dist/docs/01-app/01-getting-started/
// 10-error-handling.md). Retry re-renders the failed segment, which is worth
// offering first: most failures here are a transient DB or upstream-API blip.
//
// `error.message` is deliberately not shown. In production Next replaces it with
// a generic string anyway, and on the server side it can carry connection
// strings — the digest is the safe handle for finding the real one in the logs.

import { useEffect } from "react";
import StatusPage, { StatusPrimary, StatusSecondary } from "@/components/StatusPage";
import { reportClientError } from "@/lib/report-error";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Netlify collects stderr from the function logs; this is what makes a user
    // report ("reference abc123") traceable back to a stack.
    console.error("Unhandled error", { digest: error.digest, error });
    reportClientError({ scope: "root", error });
  }, [error]);

  return (
    <StatusPage
      eyebrow="Something broke"
      title="That didn't work"
      body="An unexpected error stopped this page from loading. Your lessons and recordings are safe — nothing was lost."
      digest={error.digest}
    >
      <StatusPrimary onClick={() => unstable_retry()}>Try again</StatusPrimary>
      <StatusSecondary href="/dashboard">Go to your dashboard</StatusSecondary>
    </StatusPage>
  );
}
