// Sends the lesson-report email (with the PDF attached) via Resend. Server-only.

import { Resend } from "resend";
import { env } from "./env";
import type { Session } from "./mock";

let client: Resend | undefined;
function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

function lessonTopic(title: string): string {
  return title.includes("·") ? title.split("·").slice(1).join("·").trim() : title;
}

export async function sendLessonReportEmail(args: {
  to: string;
  studentName: string;
  tutorName: string;
  session: Session;
  pdf: Uint8Array;
  /** Files the tutor attached on the review screen (src/lib/attachments.ts). */
  attachments?: { filename: string; contentType: string; data: Buffer }[];
}): Promise<void> {
  const { to, studentName, tutorName, session, pdf, attachments = [] } = args;
  const firstName = studentName.split(" ")[0];
  const topic = lessonTopic(session.title);

  // Still mention extra files, so the student knows they're from their tutor
  // and not something to be wary of.
  const attachmentsLine = attachments.length
    ? `<p style="margin:0 0 16px;color:#3f4750;">
         I've also attached ${attachments.length === 1 ? "an extra file" : "a few extra files"} for you to look through.
       </p>`
    : "";

  const html = `
  <div style="background:#fffaf0;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.6;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #f0e6d6;">
      <div style="background:#16233d;padding:26px 30px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#fdb300;">BUMBLENOTE</div>
        <div style="font-size:25px;font-weight:700;color:#ffffff;margin-top:6px;line-height:1.3;">${escapeHtml(topic)}</div>
        <div style="font-size:15px;color:#c7d8f0;margin-top:4px;">${escapeHtml(session.date)} · ${session.durationMin} min</div>
      </div>
      <div style="padding:28px 30px;color:#1f2430;font-size:17px;">
        <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px;color:#3f4750;">
          Great work in today's lesson! Your personal session report is attached as a PDF,
          with everything you covered together in one place.
        </p>
        <p style="margin:0 0 16px;color:#3f4750;">
          Take a few minutes to open it while the lesson is still fresh — it's the
          easiest way to lock in what you learned and keep your progress going.
        </p>
        ${attachmentsLine}
        <p style="margin:24px 0 0;color:#3f4750;">See you next time,<br/>${escapeHtml(tutorName)}</p>
      </div>
      <div style="padding:16px 30px;border-top:1px solid #f2ead9;font-size:13px;color:#8b909a;">
        Sent with BumbleNote
      </div>
    </div>
  </div>`;

  const { error } = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `${tutorName} - ${topic} - Feedback`,
    html,
    attachments: [
      { filename: `BumbleNote lesson — ${topic}.pdf`, content: Buffer.from(pdf) },
      ...attachments.map((a) => ({
        filename: a.filename,
        content: a.data,
        contentType: a.contentType,
      })),
    ],
  });

  if (error) {
    throw new Error(explainSendError(error.message));
  }
}

/** Shared chrome so the reset emails look like the lesson report above. */
function shell(heading: string, body: string): string {
  return `
  <div style="background:#fffaf0;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #f0e6d6;">
      <div style="background:#16233d;padding:24px 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#fdb300;">BUMBLENOTE</div>
        <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:6px;">${escapeHtml(heading)}</div>
      </div>
      <div style="padding:26px 28px;color:#1f2430;">${body}</div>
      <div style="padding:14px 28px;border-top:1px solid #f2ead9;font-size:12px;color:#8b909a;">
        Sent with BumbleNote
      </div>
    </div>
  </div>`;
}

/**
 * The "forgot password" email, with the single-use link from
 * src/lib/reset-tokens.ts.
 *
 * The URL is spelled out under the button as well: plenty of mail clients strip
 * or rewrite anchors, and a reset link nobody can click is a support ticket.
 */
export async function sendPasswordResetEmail(args: {
  to: string;
  name: string;
  url: string;
  ttlMinutes: number;
}): Promise<void> {
  const { to, name, url, ttlMinutes } = args;
  const firstName = name.split(" ")[0];
  const safeUrl = escapeHtml(url);

  const html = shell(
    "Reset your password",
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
     <p style="margin:0 0 20px;color:#3f4750;">
       Someone asked to reset the password on your BumbleNote account. Click below
       to choose a new one — the link works once and expires in ${ttlMinutes} minutes.
     </p>
     <p style="margin:0 0 20px;">
       <a href="${safeUrl}" style="display:inline-block;background:#fdb300;color:#1f2430;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:12px;">Choose a new password</a>
     </p>
     <p style="margin:0 0 20px;font-size:13px;color:#8b909a;word-break:break-all;">
       Or paste this into your browser:<br/>${safeUrl}
     </p>
     <p style="margin:0;color:#3f4750;">
       If this wasn't you, ignore this email — your password stays as it is.
     </p>`,
  );

  const { error } = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Reset your BumbleNote password",
    html,
  });

  if (error) throw new Error(explainSendError(error.message));
}

/**
 * Sent when a reset is requested for an email that signs in with Google.
 *
 * Without this, that tutor gets silence — the /forgot page can't tell them
 * their account has no password without confirming the address exists to
 * whoever typed it. Saying it in the mailbox itself only reaches the owner.
 */
export async function sendPasswordResetGoogleEmail(args: {
  to: string;
  name: string;
  loginUrl: string;
}): Promise<void> {
  const { to, name, loginUrl } = args;
  const firstName = name.split(" ")[0];
  const safeUrl = escapeHtml(loginUrl);

  const html = shell(
    "You sign in with Google",
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
     <p style="margin:0 0 20px;color:#3f4750;">
       Someone asked to reset the password on your BumbleNote account, but there's
       no password to reset — this account signs in with Google.
     </p>
     <p style="margin:0 0 20px;">
       <a href="${safeUrl}" style="display:inline-block;background:#fdb300;color:#1f2430;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:12px;">Continue with Google</a>
     </p>
     <p style="margin:0;color:#3f4750;">
       If this wasn't you, ignore this email — nothing about your account changed.
     </p>`,
  );

  const { error } = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Signing in to BumbleNote",
    html,
  });

  if (error) throw new Error(explainSendError(error.message));
}

/**
 * The operator alert — "a lesson failed to process", "a page threw". Plain and
 * dense on purpose: it's read on a phone, at a glance, to decide whether to open
 * a laptop. See src/lib/alerts.ts, which is what callers actually use (it adds
 * the throttling and swallows failures).
 *
 * `fields` is rendered verbatim, so callers must keep student names and email
 * addresses out of it and pass opaque ids instead. The privacy policy names
 * Resend as a processor of report emails; routing student identities through it
 * a second time, into an ops mailbox that outlives the lesson, isn't something
 * the tutor agreed to.
 */
export async function sendOperatorAlertEmail(args: {
  to: string;
  subject: string;
  summary: string;
  fields: Record<string, string>;
}): Promise<void> {
  const { to, subject, summary, fields } = args;

  const rows = Object.entries(fields)
    .map(
      ([key, value]) =>
        `<tr>
           <td style="padding:6px 14px 6px 0;color:#8b909a;white-space:nowrap;vertical-align:top;">${escapeHtml(key)}</td>
           <td style="padding:6px 0;color:#1f2430;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word;">${escapeHtml(value)}</td>
         </tr>`,
    )
    .join("");

  const html = shell(
    subject,
    `<p style="margin:0 0 18px;color:#3f4750;">${escapeHtml(summary)}</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>`,
  );

  const { error } = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `[BumbleNote] ${subject}`,
    html,
  });

  if (error) throw new Error(explainSendError(error.message));
}

/**
 * Turn Resend's API errors into something a tutor can act on.
 *
 * The big one: with the default sandbox sender (onboarding@resend.dev) Resend
 * only delivers to the email on the Resend *account* — every other student is
 * rejected with a 403 whose message quotes that account address. Passing it
 * through verbatim both confused tutors and leaked the account owner's email,
 * so it's replaced with a message about the actual fix (verify a domain and set
 * EMAIL_FROM). See .env.example → "Email (Resend)".
 */
function explainSendError(message: string | undefined): string {
  const raw = message ?? "unknown error";
  if (/only send testing emails to your own email address/i.test(raw)) {
    return (
      "Email delivery is still in Resend's test mode, which can only send to the " +
      "Resend account owner. Verify a domain at resend.com/domains and set the " +
      "EMAIL_FROM environment variable to an address on it."
    );
  }
  return `Couldn't send the email: ${raw}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
