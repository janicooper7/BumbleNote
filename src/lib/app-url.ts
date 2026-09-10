// The site's own origin, for links that have to survive leaving the browser
// (password-reset emails, mainly).

import { headers } from "next/headers";

/**
 * Absolute origin, e.g. "https://bumblenote.com".
 *
 * APP_URL wins when it's set, and it should be set in production. The fallback
 * reads the Host header, which a request can lie about — that's the classic way
 * a reset email gets rewritten to point at an attacker's domain. Netlify
 * overwrites `x-forwarded-host` on the way in, so the fallback is sound there,
 * but pinning APP_URL removes the question entirely.
 */
export async function appOrigin(): Promise<string> {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Can't resolve the site origin — set APP_URL.");

  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The canonical origin, resolved without touching request headers.
 *
 * `appOrigin()` above is the right call inside a request — it can fall back to
 * the Host header. Metadata, robots.txt and the sitemap are built at render time
 * for a fixed public URL and must not depend on who is asking: reading headers
 * there would opt those routes out of static generation and, worse, let a
 * spoofed Host rewrite the canonical URL and the sitemap's own entries.
 *
 * The literal is the production domain, used when APP_URL is unset (local dev,
 * and preview deploys where an absolute URL is cosmetic).
 */
export const SITE_URL =
  process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://bumblenote.com";
