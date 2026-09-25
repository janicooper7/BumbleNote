// The unsubscribe link in waitlist emails (src/lib/waitlist-welcome.ts).
//
// Lives under /api so the pre-launch gate (src/proxy.ts) doesn't send people to
// the password page. Two steps on purpose:
//
//   GET  → a page with one "Unsubscribe" button. Link scanners in Outlook and
//          corporate mail open every link in a message; if GET removed the
//          address, those scans would unsubscribe people who never clicked.
//   POST → removes the address. This is also what Gmail's own "Unsubscribe"
//          button sends (RFC 8058 one-click, via the List-Unsubscribe-Post
//          header), so that path needs no page at all.
//
// A valid link for an address that's already gone still reports success: the
// person wanted off the list, and they're off it.

import type { NextRequest } from "next/server";
import { removeFromWaitlist } from "@/lib/waitlist-welcome";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The waitlist row id from the link, or null if it isn't one (see unsubscribeUrl). */
function rowId(req: NextRequest): string | null {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  return UUID.test(id) ? id : null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const id = rowId(req);
  if (!id) return page(BROKEN, 400);

  const action = `/api/waitlist/unsubscribe?${new URLSearchParams({ id })}`;
  return page(
    `<h1>Leave the BumbleNote list?</h1>
     <p>You won't get any more emails about the launch.</p>
     <form method="post" action="${escapeAttr(action)}">
       <button type="submit">Unsubscribe</button>
     </form>`,
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const id = rowId(req);
  if (!id) return page(BROKEN, 400);

  try {
    await removeFromWaitlist(id);
  } catch (err) {
    console.error("[waitlist] unsubscribe failed", err);
    return page(
      `<h1>Something went wrong</h1>
       <p>We couldn't remove your address just now. Please try the link again in a moment.</p>`,
      500,
    );
  }

  return page(
    `<h1>You're unsubscribed</h1>
     <p>We've removed your email address from the BumbleNote list, so you won't hear from us again.</p>`,
  );
}

const BROKEN = `<h1>This link doesn't work</h1>
  <p>It may have been cut off when it was copied. Try clicking the link in the email again.</p>`;

function page(body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>BumbleNote</title>
<style>
  body { margin: 0; background: #fbf8f1; color: #412e28; font: 17px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 440px; margin: 12vh auto 0; padding: 32px 28px; background: #fff; border-radius: 14px; }
  img { display: block; width: 112px; height: 64px; margin-bottom: 20px; }
  h1 { font: 400 28px/1.2 Georgia, "Times New Roman", serif; margin: 0 0 10px; }
  p { margin: 0 0 20px; color: #6b5245; }
  button { font: 700 15px/1 inherit; background: #412e28; color: #fff0b5; border: 0; border-radius: 999px; padding: 14px 26px; cursor: pointer; }
</style></head>
<body><main><img src="/logo-lockup.png" alt="BumbleNote">${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
