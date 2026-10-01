// The unsubscribe link in marketing emails to tutors (the trial-finished email,
// src/lib/lifecycle-emails.ts). Keyed on tutors.email_token. It turns off
// marketing emails only: lesson reports, password resets and other emails
// about the account itself still arrive.
//
// Same two steps as the waitlist link (src/app/api/waitlist/unsubscribe): GET
// shows a button, so mail scanners that open every link don't unsubscribe
// anyone; POST does it, and is also what Gmail's one-click button sends.

import type { NextRequest } from "next/server";
import { optOutTutor } from "@/lib/lifecycle-emails";
import { escapeAttr, unsubscribePage as page } from "@/lib/unsubscribe-page";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tokenOf(req: NextRequest): string | null {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return UUID.test(token) ? token : null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = tokenOf(req);
  if (!token) return page(BROKEN, 400);

  const action = `/api/email/unsubscribe?${new URLSearchParams({ token })}`;
  return page(
    `<h1>Stop BumbleNote tips and offers?</h1>
     <p>You'll still get emails about your account, like lesson reports and password resets.</p>
     <form method="post" action="${escapeAttr(action)}">
       <button type="submit">Unsubscribe</button>
     </form>`,
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const token = tokenOf(req);
  if (!token) return page(BROKEN, 400);

  try {
    await optOutTutor(token);
  } catch (err) {
    console.error("[email] unsubscribe failed", err);
    return page(
      `<h1>Something went wrong</h1>
       <p>We couldn't update your preferences just now. Please try the link again in a moment.</p>`,
      500,
    );
  }

  return page(
    `<h1>You're unsubscribed</h1>
     <p>We won't send you any more tips or offers. Emails about your account will still arrive.</p>`,
  );
}

const BROKEN = `<h1>This link doesn't work</h1>
  <p>It may have been cut off when it was copied. Try clicking the link in the email again.</p>`;
