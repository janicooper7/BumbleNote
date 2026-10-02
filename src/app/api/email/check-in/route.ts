// The answer links in Millie's check-in email (email 7, src/lib/lifecycle-emails.ts):
// "what's in the way?", one link per answer, since we don't take replies.
//
// GET shows the help for that answer straight away. It doesn't record anything,
// because mail scanners open every link in an email, and recording on GET would
// file all five answers for everyone. The page POSTs the answer back from the
// browser instead, which scanners that only fetch the link never do.

import type { NextRequest } from "next/server";
import { isStuckReason, STUCK_HELP, type StuckReason } from "@/lib/check-in";
import { recordStuckReason } from "@/lib/lifecycle-emails";
import { escapeAttr, unsubscribePage as page } from "@/lib/unsubscribe-page";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse(req: NextRequest): { token: string; answer: StuckReason } | null {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const answer = req.nextUrl.searchParams.get("answer") ?? "";
  return UUID.test(token) && isStuckReason(answer) ? { token, answer } : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(req: NextRequest): Promise<Response> {
  const parsed = parse(req);
  if (!parsed) return page(BROKEN, 400);

  const help = STUCK_HELP[parsed.answer];
  const self = `/api/email/check-in?${new URLSearchParams(parsed)}`;
  return page(
    `<h1>${escapeHtml(help.title)}</h1>
     ${help.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
     <p><a href="${escapeAttr(help.link.href)}" style="color:#412e28;font-weight:700;">${escapeHtml(help.link.label)} &rarr;</a></p>
     <script>fetch(${JSON.stringify(self)}, { method: "POST" }).catch(function () {});</script>`,
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const parsed = parse(req);
  if (!parsed) return new Response(null, { status: 400 });
  try {
    await recordStuckReason(parsed.token, parsed.answer);
  } catch (err) {
    // The tutor already has their help page; a lost answer only costs us a data point.
    console.error("[email] check-in answer failed", err);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}

const BROKEN = `<h1>This link doesn't work</h1>
  <p>It may have been cut off when it was copied. Try clicking the link in the email again.</p>`;
