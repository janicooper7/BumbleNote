"use client";

// Dashboard error boundary. Sitting inside the dashboard segment means the
// sidebar in dashboard/layout.tsx keeps rendering, so a tutor who hits a failing
// page can still navigate away instead of being dropped on a bare full-screen
// error. (A throw from the layout itself has no boundary below it and falls
// through to src/app/error.tsx, which is what should happen.)

import { useEffect } from "react";
import Topbar from "@/components/dashboard/Topbar";
import { reportClientError } from "@/lib/report-error";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error", { digest: error.digest, error });
    reportClientError({ scope: "dashboard", error });
  }, [error]);

  return (
    <>
      <Topbar title="Something went wrong" subtitle="This page didn't load" />
      <div className="p-8">
        <div className="mx-auto max-w-[520px] rounded-2xl border border-line bg-surface p-8 text-center shadow-soft-sm">
          <h2 className="font-display text-[1.6rem] leading-tight text-ink">
            We couldn&rsquo;t load this page
          </h2>
          <p className="mt-3 text-ink-soft">
            The error was on our side. Your students, lessons and recordings are
            untouched — trying again usually clears it.
          </p>

          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-7 rounded-xl bg-brand px-6 py-3 font-semibold text-ink shadow-soft-sm transition-all duration-200 hover:bg-brand-lit"
          >
            Try again
          </button>

          {error.digest && (
            <p className="mt-7 text-[.8rem] text-muted">
              Reference{" "}
              <code className="font-mono text-ink-soft">{error.digest}</code> — quote
              it if you get in touch.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
