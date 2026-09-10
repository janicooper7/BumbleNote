"use client";

// Last-resort boundary: this only fires when the root layout itself threw, so it
// replaces that layout entirely and must supply its own <html>/<body>.
//
// Everything here is inline-styled on purpose. The root layout is what loads
// globals.css and the next/font variables, so at this point neither is
// guaranteed to be present — a Tailwind class could render as unstyled text on a
// white page. Inline styles always survive.

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Global error", { digest: error.digest, error });
    reportClientError({ scope: "global", error });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#fffdf7",
          color: "#16233d",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.6,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "34rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: ".82rem",
              fontWeight: 600,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "#9a6400",
            }}
          >
            Something broke
          </p>
          <h1 style={{ margin: "1rem 0 0", fontSize: "2.1rem", lineHeight: 1.15 }}>
            BumbleNote couldn&rsquo;t load
          </h1>
          <p style={{ margin: "1.25rem 0 0", fontSize: "1.125rem", color: "#4d5d79" }}>
            Something went wrong before the page could start. Your lessons and
            recordings are safe — nothing was lost.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: ".75rem",
              justifyContent: "center",
              marginTop: "2.25rem",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                cursor: "pointer",
                border: 0,
                borderRadius: ".75rem",
                background: "#fdb300",
                color: "#16233d",
                font: "inherit",
                fontWeight: 600,
                padding: ".75rem 1.5rem",
              }}
            >
              Try again
            </button>
            {/* A plain <a>, not next/link, on purpose: the root layout is what
                just crashed, so a client-side navigation would re-enter the same
                broken tree. A full document load is the only thing that reliably
                gets the visitor out. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: ".75rem",
                border: "1px solid #f7dfa6",
                color: "#4d5d79",
                fontWeight: 600,
                padding: ".75rem 1.5rem",
                textDecoration: "none",
              }}
            >
              Back to the site
            </a>
          </div>

          {error.digest && (
            <p style={{ marginTop: "2.5rem", fontSize: ".8rem", color: "#8c9ab0" }}>
              Reference <code>{error.digest}</code> — quote it if you get in touch
              and we can find what went wrong.
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
