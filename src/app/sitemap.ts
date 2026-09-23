// sitemap.xml.
//
// Only the pages a stranger should be able to find: the marketing page, the two
// legal documents, and the signup/login entry points. Everything under
// /dashboard is per-tutor and behind auth, and the token-bearing pages (/reset,
// /forgot, /enter) are worthless in an index — so none of them belong here.
//
// This list is short and changes rarely, which is why it's written out rather
// than derived from the route tree: a new public page should be a deliberate
// addition here, not something that appears in the index by accident.
//
// lastModified is a real date, not the time of the request: a sitemap that
// claims every page changed a moment ago teaches Google to ignore its dates.
// Bump MARKETING_UPDATED when the homepage, signup or login copy materially
// changes; the legal pages carry their own date.

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/app-url";
import { LEGAL } from "@/lib/legal";

const MARKETING_UPDATED = new Date("2026-09-23");

export default function sitemap(): MetadataRoute.Sitemap {
  const legalUpdated = new Date(LEGAL.lastUpdatedISO);

  return [
    {
      url: SITE_URL,
      lastModified: MARKETING_UPDATED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: MARKETING_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: MARKETING_UPDATED,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: legalUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: legalUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
