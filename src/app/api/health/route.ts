// Liveness check for an external uptime monitor (UptimeRobot, Better Stack, …).
//
// The monitor has to live outside our stack. Our own alerts are sent through
// Netlify and Resend, so they go quiet in exactly the outages that matter most:
// a paused Netlify site or a suspended Neon database. Point the monitor at
// https://bumblenote.com/api/health and have it page you on anything but a 200.
//
// Queries the database on purpose, because a site that serves pages with no
// database is still down for tutors. Returns no detail beyond ok/down, since the
// endpoint is public (and outside the site gate: /api is excluded in src/proxy.ts).

import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers });
  } catch (err) {
    console.error("[health] database check failed:", err);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
