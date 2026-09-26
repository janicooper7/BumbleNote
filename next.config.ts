import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Deliberately not here: a full Content-Security-Policy. Next injects inline
 * bootstrap scripts, so a real policy needs per-request nonces plumbed through
 * the proxy, and a half-written one that ends in `unsafe-inline` buys nothing.
 * `frame-ancestors` is the exception — it can't be set from a <meta> tag, it
 * doesn't interact with scripts, and it's the directive that actually stops
 * clickjacking (X-Frame-Options below is the same rule for older browsers).
 */
const securityHeaders = [
  // Netlify terminates TLS and redirects to HTTPS; this stops the first,
  // interceptable plain-HTTP hop on every later visit. Two years, subdomains
  // included. No `preload` — that's a hard-to-reverse commitment to the browser
  // vendors' list and should be a deliberate, separate decision.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Stop the browser second-guessing Content-Type. Matters most for the PDF and
  // audio bytes we serve back, which must never be sniffed as HTML and run.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full URL only to ourselves. Password-reset and gate links carry
  // tokens in the query string, so leaking a full referrer cross-origin would
  // hand them to whatever the page links out to.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Drop every powerful feature the product doesn't use, and keep the two it
  // does: the in-dashboard recorder needs the mic (tutor track) and screen
  // capture (the lesson tab's audio, i.e. the student track) — see
  // src/components/dashboard/useSessionRecorder.ts. Removing either breaks
  // recording outright.
  {
    key: "Permissions-Policy",
    value: [
      "microphone=(self)",
      "display-capture=(self)",
      "camera=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "accelerometer=()",
      "gyroscope=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't get confused by other lockfiles
  // that may exist higher up in the user's home directory.
  turbopack: {
    root: __dirname,
  },
  // Don't advertise the framework and version to anyone scanning for a known
  // Next.js CVE.
  poweredByHeader: false,
  images: {
    // Thumbnails for the YouTube how-to videos (see YouTubeEmbed).
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**", search: "" },
    ],
  },
  experimental: {
    // Keep visited dashboard pages in the browser's router cache for 30s, so
    // flipping between Students, Lessons and home doesn't refetch each time
    // (Next's default for dynamic pages is 0). Every mutation's Server Action
    // calls revalidatePath, which clears this cache, so edits always show. The
    // one gap: a draft finished by the background worker can take up to 30s to
    // appear on a page revisited from cache.
    staleTimes: {
      dynamic: 30,
    },
    // Lesson audio (two tracks, up to ~an hour each) is uploaded to the
    // transcribe Server Action; the default 1MB cap is far too small.
    serverActions: {
      bodySizeLimit: "80mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
