// Route protection (Next.js 16 renamed Middleware → Proxy). Two rules, in order:
//
//   1. The pre-launch site gate — no valid gate cookie, no site at all (/enter).
//   2. Dashboard auth — /dashboard requires a signed-in tutor, else /login.
//
// Uses only the edge-safe auth config (no DB import). Note that passing a
// handler to `auth()` means NextAuth's own `authorized` callback no longer
// drives the redirect (see node_modules/next-auth/lib/index.js — the
// userMiddlewareOrRoute branch wins over the !authorized branch), so rule 2 is
// enforced here rather than in auth.config.ts.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { GATE_COOKIE, GATE_PATH, gateEnabled, tokenIsValid } from "@/lib/site-gate";

const { auth } = NextAuth(authConfig);

/**
 * Pages that must stay publicly reachable even while the pre-launch gate is up.
 *
 * Google's OAuth verification fetches the privacy policy and terms from the URLs
 * registered on the consent screen, as an anonymous client with no cookies. Behind
 * the gate those URLs answer with a redirect to /enter, and verification fails —
 * so the gate deliberately does not cover them. Neither page reveals anything
 * about the product that the policy itself doesn't already state.
 */
const PUBLIC_PATHS = ["/terms", "/privacy"];

/**
 * Marketing pages opened up ahead of launch when PUBLIC_MARKETING_PAGES=true, so
 * Meta's ad review (and anyone clicking an ad) can load them. The app itself
 * stays behind the gate: signing up from /signup still lands on /dashboard,
 * which asks for the password until the gate comes down at launch.
 */
const MARKETING_PATHS = ["/", "/signup", "/opengraph-image"];

function marketingPagesOpen(): boolean {
  return process.env.PUBLIC_MARKETING_PAGES === "true";
}

export default auth((request) => {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (marketingPagesOpen() && MARKETING_PATHS.includes(pathname)) return NextResponse.next();

  if (gateEnabled() && !tokenIsValid(request.cookies.get(GATE_COOKIE)?.value)) {
    const url = request.nextUrl.clone();
    url.pathname = GATE_PATH;
    url.search = "";
    // Remember where they were headed so the gate can send them back there.
    const from = pathname + search;
    if (from !== "/") url.searchParams.set("from", from);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/dashboard") && !request.auth?.user) {
    const url = request.nextUrl.clone();
    url.pathname = authConfig.pages.signIn;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // The gate has to cover the whole site, so this is far broader than the old
  // /dashboard-only matcher. Excluded:
  //   api        — those routes authenticate themselves, and the capture
  //                extension calls them with a Bearer token and no cookies, so
  //                gating them would break uploads mid-recording.
  //   enter      — the gate page itself, plus its Server Action (a Server
  //                Function POSTs to the route it lives on, so excluding the
  //                path excludes the action too).
  //   _next, .*  — build output and static assets under public/.
  matcher: ["/((?!api|enter|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
