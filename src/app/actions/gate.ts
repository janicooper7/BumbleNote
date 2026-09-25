"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  GATE_COOKIE,
  GATE_MAX_AGE,
  issueToken,
  safeReturnPath,
} from "@/lib/site-gate";

/**
 * Check the shared site password and, if it's right, drop the gate cookie that
 * src/proxy.ts looks for. A wrong password bounces back to /enter?error=1 —
 * nothing distinguishes "wrong password" from "gate disabled", so there's no
 * signal to probe.
 */
export async function enterSite(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const from = safeReturnPath(String(formData.get("from") ?? "/"));

  // One shared password is the easiest thing on the site to brute-force, so
  // every attempt counts, right or wrong. Ten per quarter-hour is plenty for a
  // person fumbling it and useless to a guesser. "busy" gets its own copy on
  // /enter; it only says the IP is throttled, not whether any guess was close.
  const limited = await rateLimit({
    key: `gate:ip:${clientIp(await headers())}`,
    limit: 10,
    windowSec: 15 * 60,
  });
  const token = limited.ok ? issueToken(password) : null;
  if (!token) {
    const params = new URLSearchParams({ error: limited.ok ? "1" : "busy" });
    if (from !== "/") params.set("from", from);
    redirect(`/enter?${params.toString()}`);
  }

  const store = await cookies();
  store.set({
    name: GATE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE,
  });

  redirect(from);
}
