// robots.txt.
//
// Two modes, keyed off the same SITE_PASSWORD that drives the gate in
// src/proxy.ts. While the gate is up every URL except /terms and /privacy
// answers with a redirect to /enter, so inviting crawlers in would only teach
// them that the whole site is a redirect loop — and any URL they did cache would
// be one we haven't launched yet. Once SITE_PASSWORD is cleared the site is
// public and this opens up on its own, with no second switch to remember.
//
// /dashboard and /api stay disallowed either way. Both require auth so a crawler
// can't read them regardless; keeping them out of robots.txt just stops the
// sign-in redirects showing up as crawl errors.

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/app-url";
import { gateEnabled } from "@/lib/site-gate";

export default function robots(): MetadataRoute.Robots {
  if (gateEnabled()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/enter", "/reset", "/forgot"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
