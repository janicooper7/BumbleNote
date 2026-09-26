// Sends the lesson-report email (with the PDF attached) via Resend. Server-only.

import { Resend } from "resend";
import { env } from "./env";
import type { Session } from "./mock";
import { SOCIAL_LINKS } from "./socials";

let client: Resend | undefined;
function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

/**
 * Public origin for links inside student emails. Read directly rather than via
 * src/lib/app-url: that module imports next/headers, and this file is bundled
 * into the Netlify functions (through src/lib/alerts), where next/* can't resolve.
 */
const PUBLIC_ORIGIN =
  process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://bumblenote.com";

/**
 * The social-kit palette (globals.css → cocoa / butter / sky), spelled out
 * because email clients can't read CSS variables. Same values as the waitlist
 * email below.
 */
const C = {
  page: "#fbf8f1",
  card: "#ffffff",
  cocoa: "#412e28",
  soft: "#6b5245",
  muted: "#8a7466",
  line: "#eadfce",
  butter: "#fff0b5",
  sky: "#c1d9e6",
};
const SERIF = `'Fraunces', Georgia, 'Times New Roman', serif`;
const SANS = `'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const FONTS_LINK = `<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400&family=Hanken+Grotesk:wght@400;700&display=swap" rel="stylesheet">`;

/** Brown pill with butter text, like the dashboard's primary buttons. */
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${C.cocoa};color:${C.butter};text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.06em;text-transform:uppercase;padding:13px 26px;border-radius:999px;">${label}</a>`;
}

/**
 * Shared chrome for every product email: logo and serif heading on white,
 * a sky rule under the header, cocoa body text and a soft footer band.
 */
function frame(opts: { heading: string; subheading?: string; body: string; footer: string; fontSize?: number }): string {
  const { heading, subheading, body, footer, fontSize = 16 } = opts;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
${FONTS_LINK}</head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border-radius:12px;overflow:hidden;">
    <tr><td style="padding:28px 32px 20px;border-bottom:3px solid ${C.sky};">
      <img src="${PUBLIC_ORIGIN}/logo-lockup.png" width="84" height="48" alt="BumbleNote" style="display:block;border:0;width:84px;height:48px;margin-bottom:16px;">
      <div style="font-family:${SERIF};font-size:26px;line-height:1.2;color:${C.cocoa};">${escapeHtml(heading)}</div>
      ${subheading ? `<div style="font-family:${SANS};font-size:14px;color:${C.muted};margin-top:6px;">${escapeHtml(subheading)}</div>` : ""}
    </td></tr>
    <tr><td style="padding:26px 32px 30px;font-family:${SANS};font-size:${fontSize}px;line-height:1.6;color:${C.cocoa};">${body}</td></tr>
    <tr><td style="background:${C.page};padding:16px 32px;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.muted};">${footer}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function lessonTopic(title: string): string {
  return title.includes("·") ? title.split("·").slice(1).join("·").trim() : title;
}

export async function sendLessonReportEmail(args: {
  to: string;
  studentName: string;
  tutorName: string;
  /** Where the student's replies go — the From address is a no-reply sender. */
  tutorEmail: string;
  /** BCC the tutor so they have a copy of exactly what the student received. */
  copyTutor?: boolean;
  session: Session;
  pdf: Uint8Array;
  /** Files the tutor attached on the review screen (src/lib/attachments.ts). */
  attachments?: { filename: string; contentType: string; data: Buffer }[];
}): Promise<void> {
  const {
    to,
    studentName,
    tutorName,
    tutorEmail,
    copyTutor = false,
    session,
    pdf,
    attachments = [],
  } = args;
  const firstName = studentName.split(" ")[0];
  const topic = lessonTopic(session.title);

  // Still mention extra files, so the student knows they're from their tutor
  // and not something to be wary of.
  const attachmentsLine = attachments.length
    ? `<p style="margin:0 0 16px;color:${C.soft};">
         I've also attached ${attachments.length === 1 ? "an extra file" : "a few extra files"} for you to look through.
       </p>`
    : "";

  const html = frame({
    heading: topic,
    subheading: session.date,
    fontSize: 17,
    body: `
        <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px;color:${C.soft};">
          Great work in the lesson! Your personal session report is attached as a PDF,
          with everything you covered together in one place.
        </p>
        <p style="margin:0 0 16px;color:${C.soft};">
          Take a few minutes to open it while the lesson is still fresh — it's the
          easiest way to lock in what you learned and keep your progress going.
        </p>
        ${attachmentsLine}
        <p style="margin:24px 0 0;color:${C.soft};">See you next time,<br/><span style="font-family:${SERIF};font-size:20px;color:${C.cocoa};">${escapeHtml(tutorName)}</span></p>`,
    footer: `
        Sent with BumbleNote. ${escapeHtml(tutorName)} recorded your lesson with your
        agreement to write this report, and the recording has since been deleted.
        <a href="${PUBLIC_ORIGIN}/privacy#students" style="color:${C.soft};">How your data is handled</a>
        &middot; questions go to ${escapeHtml(tutorName)} &mdash; just reply to this email.`,
  });

  const { error } = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to,
    replyTo: tutorEmail,
    // Skip when the tutor sent to themselves (testing), or they'd get it twice.
    bcc: copyTutor && tutorEmail.toLowerCase() !== to.toLowerCase() ? tutorEmail : undefined,
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

/** The smaller emails (password reset, alerts, feedback) in the same frame. */
function shell(heading: string, body: string): string {
  return frame({ heading, body, footer: "Sent with BumbleNote" });
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
     <p style="margin:0 0 20px;color:${C.soft};">
       Someone asked to reset the password on your BumbleNote account. Click below
       to choose a new one — the link works once and expires in ${ttlMinutes} minutes.
     </p>
     <p style="margin:0 0 20px;">
       ${button(safeUrl, "Choose a new password")}
     </p>
     <p style="margin:0 0 20px;font-size:13px;color:${C.muted};word-break:break-all;">
       Or paste this into your browser:<br/>${safeUrl}
     </p>
     <p style="margin:0;color:${C.soft};">
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
     <p style="margin:0 0 20px;color:${C.soft};">
       Someone asked to reset the password on your BumbleNote account, but there's
       no password to reset — this account signs in with Google.
     </p>
     <p style="margin:0 0 20px;">
       ${button(safeUrl, "Continue with Google")}
     </p>
     <p style="margin:0;color:${C.soft};">
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
           <td style="padding:6px 14px 6px 0;color:${C.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(key)}</td>
           <td style="padding:6px 0;color:${C.cocoa};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word;">${escapeHtml(value)}</td>
         </tr>`,
    )
    .join("");

  const html = shell(
    subject,
    `<p style="margin:0 0 18px;color:${C.soft};">${escapeHtml(summary)}</p>
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

/** What a "Get in touch" message is about, as the tutor tagged it. */
export type ContactTopic = "problem" | "feedback" | "question";

const CONTACT_LABEL: Record<ContactTopic, string> = {
  problem: "Problem report",
  feedback: "Feedback",
  question: "Question",
};

/**
 * A tutor's message from the dashboard "Get in touch" button, to the operator.
 * Reply-To is the tutor, so answering it goes straight back to them. The topic
 * leads the subject, so problem reports stand out in the inbox.
 */
export async function sendFeedbackEmail(args: {
  to: string;
  tutorName: string;
  tutorEmail: string;
  message: string;
  page: string;
  topic?: ContactTopic;
}): Promise<void> {
  const { to, tutorName, tutorEmail, message, page, topic } = args;
  const label = topic ? CONTACT_LABEL[topic] : "Message";

  const html = shell(
    `New ${label.toLowerCase()}`,
    `<p style="margin:0 0 6px;color:${C.cocoa};font-weight:600;">${escapeHtml(tutorName)}</p>
     <p style="margin:0 0 18px;color:${C.muted};font-size:13px;">${escapeHtml(tutorEmail)} · from ${escapeHtml(page)}</p>
     <div style="white-space:pre-wrap;color:${C.soft};line-height:1.6;">${escapeHtml(message)}</div>`,
  );

  const { error } = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to,
    replyTo: tutorEmail,
    subject: `[BumbleNote] ${label} from ${tutorName}`,
    html,
  });

  if (error) throw new Error(explainSendError(error.message));
}

/**
 * The waitlist welcome email (launch sequence, email 1). Callers go through
 * sendWaitlistWelcome in src/lib/waitlist-welcome.ts, which makes sure each
 * address gets it once.
 *
 * Styled after the launch-email drafts rather than the product shell above:
 * brown on white, the logo lockup, Fraunces where the client loads web fonts
 * (Apple Mail does, Gmail falls back to Georgia). Table layout and inline
 * styles because that's what email clients reliably render.
 */
export async function sendWaitlistWelcomeEmail(args: {
  to: string;
  unsubscribeUrl: string;
}): Promise<void> {
  const { to, unsubscribeUrl } = args;
  const serif = `'Fraunces', Georgia, 'Times New Roman', serif`;
  const sans = `'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  const safeUnsub = escapeHtml(unsubscribeUrl);

  const socials = SOCIAL_LINKS.length
    ? `<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eadfce;color:#6b5245;">
         Follow along while we get ready:
         ${SOCIAL_LINKS.map(
           (s) =>
             `<a href="${escapeHtml(s.url)}" style="color:#412e28;font-weight:700;">${escapeHtml(s.name)}</a>`,
         ).join(" &middot; ")}
       </p>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Hanken+Grotesk:wght@400;700&display=swap" rel="stylesheet">
<title>You're on the BumbleNote list</title></head>
<body style="margin:0;padding:0;background:#fbf8f1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Thanks for joining. Here's what's coming, and when.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbf8f1;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:32px 36px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:28px;"><img src="${PUBLIC_ORIGIN}/logo-lockup.png" width="112" height="64" alt="BumbleNote" style="display:block;border:0;width:112px;height:64px;"></td>
        <td valign="middle" style="font-family:${serif};font-size:28px;line-height:1.15;color:#412e28;">Thanks for joining. <em>You're one of the first.</em></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:16px 36px 32px;font-family:${sans};font-size:16px;line-height:1.6;color:#412e28;">
      <p style="margin:0 0 16px;">Hey busy-bee,</p>
      <p style="margin:0 0 16px;">Thank you for putting your name down for BumbleNote. We're building it for tutors who love teaching, but not the admin that comes after it: the recap, the homework message, the note to yourself about what to cover next time.</p>
      <p style="margin:0 0 24px;">We're opening the doors on <b>Sunday 4 October at 9am (UK time)</b>. You'll get an email from us the moment we're live, and you can try it on two real lessons for free.</p>
      <p style="margin:0;font-family:${serif};font-style:italic;font-size:20px;line-height:1.3;">Millie &amp; Jani</p>
      <p style="margin:0;color:#6b5245;">Co-founders, BumbleNote</p>
      ${socials}
    </td></tr>
    <tr><td style="background:#fbf8f1;padding:18px 36px;font-family:${sans};font-size:12px;line-height:1.5;color:#8a7466;">
      You're getting this because you joined the BumbleNote waitlist. <a href="${safeUnsub}" style="color:#6b5245;">Unsubscribe</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    "Hey busy-bee,",
    "Thank you for putting your name down for BumbleNote. We're building it for tutors who love teaching, but not the admin that comes after it: the recap, the homework message, the note to yourself about what to cover next time.",
    "We're opening the doors on Sunday 4 October at 9am (UK time). You'll get an email from us the moment we're live, and you can try it on two real lessons for free.",
    "Millie & Jani\nCo-founders, BumbleNote",
    ...(SOCIAL_LINKS.length
      ? [`Follow along while we get ready:\n${SOCIAL_LINKS.map((s) => `${s.name}: ${s.url}`).join("\n")}`]
      : []),
    `You're getting this because you joined the BumbleNote waitlist. Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n\n");

  const { error } = await getClient().emails.send({
    from: env.MARKETING_EMAIL_FROM,
    to,
    subject: "You're on the BumbleNote list",
    html,
    text,
    // One-click unsubscribe (RFC 8058). Gmail and Yahoo expect it on bulk mail
    // and show their own "Unsubscribe" button next to the sender.
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
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
