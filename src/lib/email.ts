// Sends the lesson-report email (with the PDF attached) via Resend. Server-only.

import { Resend } from "resend";
import { env } from "./env";
import { STUCK_LABEL, STUCK_REASONS, type StuckReason } from "./check-in";
import { PLANS } from "./plans";
import { formatUsd, PAID_PLAN_IDS, PLAN_PRICES_USD } from "./pricing";
import type { Session } from "./mock";
import { SOCIAL_LINKS } from "./socials";
import { TRUSTPILOT_PAGE_URL, TRUSTPILOT_REVIEW_URL } from "./trustpilot";
import { recordEmailSent } from "./usage";
import type { UsageReport } from "./usage-report";

let client: Resend | undefined;
function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

/**
 * Every send goes through here so each accepted email is counted for the spend
 * report — the counts are what run into Resend's daily and monthly caps.
 */
async function send(kind: string, payload: Parameters<Resend["emails"]["send"]>[0]) {
  const result = await getClient().emails.send(payload);
  if (!result.error) await recordEmailSent(kind);
  return result;
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

/** The review line for emails to tutors and the waitlist (students get their own). */
const TUTOR_REVIEW_LINE =
  "Enjoying BumbleNote? A quick review on Trustpilot helps other tutors find us, and we read every single one.";

/**
 * Review invitation under the sign-off. The logo is live text (green star +
 * wordmark) rather than an image, so it shows even where images are blocked.
 * Worded for happy and unhappy readers alike: Trustpilot doesn't allow asking
 * only the people you expect to be pleased.
 */
function trustpilotInvite(line: string): string {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid ${C.line};">
          <tr><td style="padding-top:18px;">
            <a href="${TRUSTPILOT_PAGE_URL}" style="text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#191919;"><span style="color:#00b67a;">&#9733;</span>&nbsp;Trustpilot</a>
            <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:${C.soft};">${line} <a href="${TRUSTPILOT_REVIEW_URL}" style="color:${C.cocoa};font-weight:700;">Leave a review</a></p>
          </td></tr>
        </table>`;
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
          with everything we covered in one place.
        </p>
        <p style="margin:0 0 16px;color:${C.soft};">
          Take a few minutes to open it while the lesson is still fresh — it's the
          easiest way to lock in what you learned and keep your progress going.
        </p>
        ${attachmentsLine}
        <p style="margin:24px 0 0;color:${C.soft};">See you next time,<br/><span style="font-family:${SERIF};font-size:20px;color:${C.cocoa};">${escapeHtml(tutorName)}</span></p>
        ${trustpilotInvite(
          "Happy with your lesson notes, or think they could be better? Tell us on Trustpilot. Every review helps us make them more useful.",
        )}`,
    footer: "Sent with BumbleNote",
  });

  const { error } = await send("lesson-report", {
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

  const { error } = await send("password-reset", {
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

  const { error } = await send("password-reset-google", {
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

  const { error } = await send("alert", {
    from: env.EMAIL_FROM,
    to,
    subject: `[BumbleNote] ${subject}`,
    html,
  });

  if (error) throw new Error(explainSendError(error.message));
}

/**
 * The daily / monthly spend report (src/lib/usage-report.ts) to the operator.
 * Numbers and vendor names only, no people, same as the alerts.
 */
export async function sendUsageReportEmail(to: string, report: UsageReport): Promise<void> {
  const table = (rows: [string, string][], big = false) =>
    `<table style="width:100%;border-collapse:collapse;font-size:${big ? 15 : 13}px;">${rows
      .map(
        ([key, value]) =>
          `<tr>
             <td style="padding:5px 14px 5px 0;color:${C.muted};vertical-align:top;">${escapeHtml(key)}</td>
             <td style="padding:5px 0;color:${C.cocoa};text-align:right;${big ? "font-weight:700;" : ""}">${escapeHtml(value)}</td>
           </tr>`,
      )
      .join("")}</table>`;

  const warnings = report.warnings.length
    ? `<div style="background:${C.butter};border-radius:8px;padding:12px 16px;margin:0 0 20px;font-size:14px;">
         ${report.warnings.map((w) => `<p style="margin:4px 0;">⚠ ${escapeHtml(w)}</p>`).join("")}
       </div>`
    : "";

  const sections = report.sections
    .map(
      (s) =>
        `<div style="margin-top:22px;padding-top:14px;border-top:1px solid ${C.line};">
           <div style="font-weight:700;font-size:14px;margin-bottom:6px;">${escapeHtml(s.title)}</div>
           ${table(s.rows)}
         </div>`,
    )
    .join("");

  const html = shell(report.heading, `${warnings}${table(report.headline, true)}${sections}
    <p style="margin:22px 0 0;font-size:12px;color:${C.muted};">Claude and Deepgram are estimates from each call's usage at list price. Vendor invoices are the source of truth.</p>`);

  const { error } = await send("usage-report", {
    from: env.EMAIL_FROM,
    to,
    subject: `[BumbleNote] ${report.subject}`,
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

  const { error } = await send("feedback", {
    from: env.EMAIL_FROM,
    to,
    replyTo: tutorEmail,
    subject: `[BumbleNote] ${label} from ${tutorName}`,
    html,
  });

  if (error) throw new Error(explainSendError(error.message));
}

/**
 * The launch-sequence emails, 1–5 (the drafts in the "BumbleNote Launch Emails"
 * artifact). Who gets each one, and when, lives in src/lib/waitlist-welcome.ts
 * (email 1) and src/lib/lifecycle-emails.ts (2–5); these only build them.
 *
 * Every one goes through sequenceEmail below, so they share one signature
 * (sign-off, Trustpilot line, socials) and one footer with an unsubscribe link,
 * and a change to either lands in all five at once.
 *
 * Styled after the drafts rather than the product shell above: brown on white,
 * the logo lockup, Fraunces where the client loads web fonts (Apple Mail does,
 * Gmail falls back to Georgia). Table layout and inline styles because that's
 * what email clients reliably render.
 */
export type LifecycleEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

/** Who an email goes to, which decides the footer's "why you're getting this". */
export type Audience = { kind: "waitlist" | "account"; unsubscribeUrl: string };

const AUDIENCE_REASON: Record<Audience["kind"], string> = {
  waitlist: "You're getting this because you joined the BumbleNote waitlist.",
  account: "You're getting this because you have a BumbleNote account.",
};

const L_SERIF = `'Fraunces', Georgia, 'Times New Roman', serif`;
const L_SANS = `'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

function para(text: string, extra = ""): string {
  return `<p style="margin:0 0 16px;${extra}">${escapeHtml(text)}</p>`;
}

/** "Hey Anna," from the account, or the waitlist's "Hey busy-bee,". */
function greeting(firstName: string | null): string {
  return `Hey ${firstName?.trim() || "busy-bee"},`;
}

/** Who signs a sequence email: both founders, or Millie alone for her check-in. */
type Signer = "founders" | "millie";

const SIGNER: Record<Signer, { name: string; role: string }> = {
  founders: { name: "Millie & Jani", role: "Co-founders, BumbleNote" },
  millie: { name: "Millie", role: "Co-founder, BumbleNote" },
};

/** The signature every sequence email ends with: sign-off, Trustpilot, socials. */
function signatureHtml(signer: Signer): string {
  const socials = SOCIAL_LINKS.length
    ? `<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eadfce;color:#6b5245;">
        Follow along:
        ${SOCIAL_LINKS.map(
          (s) => `<a href="${escapeHtml(s.url)}" style="color:#412e28;font-weight:700;">${escapeHtml(s.name)}</a>`,
        ).join(" &middot; ")}
      </p>`
    : "";
  return `<p style="margin:0;font-family:${L_SERIF};font-style:italic;font-size:20px;line-height:1.3;">${escapeHtml(SIGNER[signer].name)}</p>
      <p style="margin:0;color:#6b5245;">${SIGNER[signer].role}</p>
      ${trustpilotInvite(TUTOR_REVIEW_LINE)}
      ${socials}`;
}

function signatureText(signer: Signer): string[] {
  return [
    `${SIGNER[signer].name}\n${SIGNER[signer].role}`,
    `${TUTOR_REVIEW_LINE} Leave a review on Trustpilot: ${TRUSTPILOT_REVIEW_URL}`,
    ...(SOCIAL_LINKS.length ? [`Follow along:\n${SOCIAL_LINKS.map((s) => `${s.name}: ${s.url}`).join("\n")}`] : []),
  ];
}

function sequenceEmail(o: {
  to: string;
  subject: string;
  preheader: string;
  /** Trusted HTML: the two-part headline, second part in italics. */
  headline: string;
  /** Trusted HTML: everything between the headline and the signature. */
  body: string;
  /** The plain-text version of `body`, one entry per paragraph. */
  text: string[];
  audience: Audience;
  signer?: Signer;
}): LifecycleEmail {
  const signer = o.signer ?? "founders";
  const reason = AUDIENCE_REASON[o.audience.kind];
  const unsub = o.audience.unsubscribeUrl;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Hanken+Grotesk:wght@400;700&display=swap" rel="stylesheet">
<title>${escapeHtml(o.subject)}</title></head>
<body style="margin:0;padding:0;background:#fbf8f1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbf8f1;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:32px 36px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:28px;"><img src="${PUBLIC_ORIGIN}/logo-lockup.png" width="112" height="64" alt="BumbleNote" style="display:block;border:0;width:112px;height:64px;"></td>
        <td valign="middle" style="font-family:${L_SERIF};font-size:28px;line-height:1.15;color:#412e28;">${o.headline}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:16px 36px 32px;font-family:${L_SANS};font-size:16px;line-height:1.6;color:#412e28;">
      ${o.body}
      ${signatureHtml(signer)}
    </td></tr>
    <tr><td style="background:#fbf8f1;padding:18px 36px;font-family:${L_SANS};font-size:12px;line-height:1.5;color:#8a7466;">
      ${escapeHtml(reason)} <a href="${escapeHtml(unsub)}" style="color:#6b5245;">Unsubscribe</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return {
    from: env.MARKETING_EMAIL_FROM,
    to: o.to,
    subject: o.subject,
    html,
    text: [...o.text, ...signatureText(signer), `${reason} Unsubscribe: ${unsub}`].join("\n\n"),
    // One-click unsubscribe (RFC 8058). Gmail and Yahoo expect it on bulk mail
    // and show their own "Unsubscribe" button next to the sender.
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** Email 1 — the waitlist welcome, on joining the waitlist. */
export function waitlistWelcomeEmail(to: string, unsubscribeUrl: string): LifecycleEmail {
  const paragraphs = [
    "Thank you for putting your name down for BumbleNote. We're building it for tutors who love teaching, but not the admin that comes after it: the recap, the homework message, the note to yourself about what to cover next time.",
  ];
  const launch = "You'll get an email from us the moment we're live, and you can try it on two real lessons for free.";
  return sequenceEmail({
    to,
    subject: "You're on the BumbleNote list",
    preheader: "Thanks for joining. Here's what's coming, and when.",
    headline: "Thanks for joining. <em>You're one of the first.</em>",
    body: `${para(greeting(null))}
      ${paragraphs.map((p) => para(p)).join("")}
      <p style="margin:0 0 24px;">We're opening the doors on <b>Sunday 4 October at 9am (UK time)</b>. ${escapeHtml(launch)}</p>`,
    text: [greeting(null), ...paragraphs, `We're opening the doors on Sunday 4 October at 9am (UK time). ${launch}`],
    audience: { kind: "waitlist", unsubscribeUrl },
  });
}

/**
 * Send the waitlist welcome to one address. Callers go through
 * sendWaitlistWelcome in src/lib/waitlist-welcome.ts, which makes sure each
 * address gets it once.
 */
export async function sendWaitlistWelcomeEmail(args: { to: string; unsubscribeUrl: string }): Promise<void> {
  const { error } = await send("waitlist-welcome", waitlistWelcomeEmail(args.to, args.unsubscribeUrl));
  if (error) throw new Error(explainSendError(error.message));
}

/** Email 2 — "We're live", to the waitlist at launch. */
export function launchLiveEmail(to: string, unsubscribeUrl: string): LifecycleEmail {
  const signupUrl = `${PUBLIC_ORIGIN}/signup`;
  const paragraphs = [
    "Today's the day we've been working towards. After countless hours of building, BumbleNote is open, and you're one of the very first tutors to have it.",
    "We've dreamed about this moment since the very first idea. The first time BumbleNote turned a real lesson into notes we'd be proud to send, we couldn't stop smiling. Now we finally get to share it with you, and honestly? We're proud, a little nervous, and more excited than we can put into words.",
    "Thank you for waiting with us, and for believing in BumbleNote before it even existed. This is only the beginning, and we're so glad you're here for it.",
  ];
  return sequenceEmail({
    to,
    subject: "BumbleNote is LIVE!",
    preheader: "The doors are open. Come on in!",
    headline: "The wait is over. <em>BumbleNote is LIVE!</em>",
    body: `${para(greeting(null))}
      ${paragraphs.map((p) => para(p)).join("\n      ")}
      <p style="margin:8px 0 24px;">${button(signupUrl, "Create your account")}</p>`,
    text: [greeting(null), ...paragraphs, `Create your account: ${signupUrl}`],
    audience: { kind: "waitlist", unsubscribeUrl },
  });
}

/** Email 3 — the benefits, to waitlist addresses that haven't signed up. */
export function launchBenefitsEmail(to: string, unsubscribeUrl: string): LifecycleEmail {
  const signupUrl = `${PUBLIC_ORIGIN}/signup`;
  const intro =
    "You know the moment. The call ends, and there's still the recap to write, the homework to send, and a note to yourself about what to cover next time. Then the next lesson starts.";
  const ticks: [string, string][] = [
    ["Your student gets a recap", "of what you covered, their corrections and their homework, so the lesson sticks after the call."],
    ["You get private notes", "on each student: the mistakes they keep making and where you left off."],
    ["It works where you already teach.", "It runs in your browser tab, with nothing to install."],
    ["You stay in charge.", "Check and edit every recap before it goes to your student."],
  ];
  const outro = "The best way to judge it is to try it on two of your own lessons. It's free, and there's no card to enter.";

  const tickRows = ticks
    .map(
      ([lead, rest]) => `<tr>
        <td valign="top" style="padding:7px 10px 0 0;"><div style="width:8px;height:8px;border-radius:50%;background:#412e28;border:3px solid #c1d9e6;"></div></td>
        <td style="padding:0 0 10px;"><b>${escapeHtml(lead)}</b> ${escapeHtml(rest)}</td>
      </tr>`,
    )
    .join("");

  return sequenceEmail({
    to,
    subject: "What happens after your lesson ends",
    preheader: `The notes, the homework, the "what did we cover last time?"`,
    headline: "The lesson ends. <em>The work usually doesn't.</em>",
    body: `${para(greeting(null))}
      ${para(intro)}
      ${para("BumbleNote takes that part off your plate:")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7d9;border-radius:10px;margin:0 0 16px;">
        <tr><td style="padding:18px 20px 8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${L_SANS};font-size:16px;line-height:1.5;color:#412e28;">${tickRows}</table></td></tr>
      </table>
      ${para(outro)}
      <p style="margin:8px 0 24px;">${button(signupUrl, "Create your account now")}</p>`,
    text: [
      greeting(null),
      intro,
      "BumbleNote takes that part off your plate:",
      ticks.map(([lead, rest]) => `- ${lead} ${rest}`).join("\n"),
      outro,
      `Create your account now: ${signupUrl}`,
    ],
    audience: { kind: "waitlist", unsubscribeUrl },
  });
}

/** Email 4 — welcome, on creating an account. */
export function accountWelcomeEmail(to: string, firstName: string | null, unsubscribeUrl: string): LifecycleEmail {
  const guide = (slug: string) => `${PUBLIC_ORIGIN}/dashboard/guides/${slug}`;
  const steps: { lead: string; rest: string; watch: string; slug: string }[] = [
    { lead: "Add your first student.", rest: "Their level, goals and interests, so the notes fit them.", watch: "Add a student", slug: "add-a-student" },
    { lead: "Record a lesson", rest: "straight from your browser tab, with nothing to install.", watch: "Record a lesson", slug: "record-a-lesson" },
    {
      lead: "Review and send the notes.",
      rest: "Check the recap, vocabulary and homework, make it your own, then send it to your student.",
      watch: "Review and edit lesson notes",
      slug: "review-lesson-notes",
    },
  ];
  const intro =
    "Thanks for creating your account. BumbleNote is for tutors who love teaching, but not the admin that comes after it: the recap, the homework message, the note to yourself about what to cover next time. You teach, and we write it up.";
  const free = "Your first two lessons are free, so try it on a real one.";
  const thanks = "Thanks for giving it a try.";
  const startUrl = `${PUBLIC_ORIGIN}/dashboard/students/new`;

  const stepRows = steps
    .map(
      (s, i) => `<tr>
        <td valign="top" style="padding:1px 10px 14px 0;"><div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:#412e28;color:#fff0b5;font-size:13px;font-weight:700;text-align:center;">${i + 1}</div></td>
        <td style="padding:0 0 14px;"><b>${escapeHtml(s.lead)}</b> ${escapeHtml(s.rest)}<br>
          <a href="${guide(s.slug)}" style="display:inline-block;margin-top:4px;font-size:14px;font-weight:700;color:#2f5d7c;text-decoration:none;">&#9654;&nbsp;Watch: ${escapeHtml(s.watch)}</a></td>
      </tr>`,
    )
    .join("");

  return sequenceEmail({
    to,
    subject: "Welcome to BumbleNote",
    preheader: "Three short videos to get you from sign-up to your first lesson.",
    headline: "Welcome to BumbleNote. <em>We're so glad you're here.</em>",
    body: `${para(greeting(firstName))}
      ${para(intro)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4eff5;border-radius:10px;margin:0 0 16px;">
        <tr><td style="padding:18px 20px 4px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b5245;margin-bottom:12px;">Get started in 3 steps</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${L_SANS};font-size:16px;line-height:1.5;color:#412e28;">${stepRows}</table>
        </td></tr>
      </table>
      ${para(free)}
      <p style="margin:8px 0 24px;">${button(startUrl, "Add your first student")}</p>
      ${para(thanks, "color:#6b5245;")}`,
    text: [
      greeting(firstName),
      intro,
      "Get started in 3 steps:\n" +
        steps.map((s, i) => `${i + 1}. ${s.lead} ${s.rest}\n   Watch: ${s.watch} - ${guide(s.slug)}`).join("\n"),
      free,
      `Add your first student: ${startUrl}`,
      thanks,
    ],
    audience: { kind: "account", unsubscribeUrl },
  });
}

/** Email 5 — trial finished, an hour after the second free lesson. */
export function trialEndedEmail(to: string, firstName: string | null, unsubscribeUrl: string): LifecycleEmail {
  const plansUrl = `${PUBLIC_ORIGIN}/dashboard/settings`;
  const paragraphs = [
    "You've used both of your free lessons. We hope it was nice to finish a lesson and find the recap already waiting.",
    "Your lessons, recaps and notes stay in your dashboard. To keep recording new lessons, choose the plan that fits how much you teach:",
  ];
  const yearly = "Pay yearly and you get two months free.";
  const yearlyRest = "That is 12 months of lessons for the price of 10, on any plan.";
  const closing = "Whatever you decide, thanks for trying BumbleNote with your students.";

  const plans = PAID_PLAN_IDS.map((id) => ({
    name: PLANS[id].name,
    price: `$${formatUsd(PLAN_PRICES_USD[id].month)}`,
    lessons: `${PLANS[id].lessons} lessons a month`,
    pick: id === "starter",
  }));
  const planCells = plans
    .map(
      (p) => `<td width="33%" valign="top" style="padding:0 4px;">
        <div style="border:1px solid ${p.pick ? "#412e28" : "#eadfce"};background:${p.pick ? "#fff7d9" : "#ffffff"};border-radius:10px;padding:12px 10px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(p.name)}</div>
          <div style="font-family:${L_SERIF};font-size:20px;line-height:1.3;">${p.price}<span style="font-family:${L_SANS};font-size:12px;color:#6b5245;">/mo</span></div>
          <div style="font-size:13px;line-height:1.4;color:#6b5245;">${escapeHtml(p.lessons)}</div>
        </div>
      </td>`,
    )
    .join("");

  return sequenceEmail({
    to,
    subject: "Your two free lessons are done",
    preheader: "Your recaps are safe in your dashboard. Here's how to keep going.",
    headline: "Two lessons, <em>written up for you.</em>",
    body: `${para(greeting(firstName))}
      ${paragraphs.map((p) => para(p)).join("")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -4px 16px;font-family:${L_SANS};color:#412e28;"><tr>${planCells}</tr></table>
      <p style="margin:0 0 16px;"><b>${escapeHtml(yearly)}</b> ${escapeHtml(yearlyRest)}</p>
      <p style="margin:8px 0 24px;">${button(plansUrl, "Choose my plan")}</p>
      ${para(closing, "color:#6b5245;")}`,
    text: [
      greeting(firstName),
      ...paragraphs,
      plans.map((p) => `- ${p.name}: ${p.price}/mo, ${p.lessons}`).join("\n"),
      `${yearly} ${yearlyRest}`,
      `Choose my plan: ${plansUrl}`,
      closing,
    ],
    audience: { kind: "account", unsubscribeUrl },
  });
}

/** Email 6 — the nudge, a day after sign-up with nothing recorded yet. */
export function firstLessonNudgeEmail(to: string, firstName: string | null, unsubscribeUrl: string): LifecycleEmail {
  const recordGuide = `${PUBLIC_ORIGIN}/dashboard/guides/record-a-lesson`;
  const startUrl = `${PUBLIC_ORIGIN}/dashboard/students/new`;
  const intro = "Your two free lessons are ready whenever you are. Here's everything it takes, start to finish:";
  const steps: [string, string][] = [
    ["Add your student.", "Their level, goals and interests, so the notes fit them."],
    ["Open your lesson in desktop Chrome or Edge,", "in a browser tab, just as you normally would."],
    ["Click “Record a lesson” in BumbleNote,", "pick your lesson tab and tick “Share tab audio”."],
    ["Teach, then check your notes.", "When the lesson ends, the recap, vocabulary and homework are waiting for you to review and send."],
  ];
  const outro = "That's all there is to it. Nothing joins your call, and nothing goes to your student until you've checked it.";

  const stepRows = steps
    .map(
      ([lead, rest], i) => `<tr>
        <td valign="top" style="padding:1px 10px 14px 0;"><div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:#412e28;color:#fff0b5;font-size:13px;font-weight:700;text-align:center;">${i + 1}</div></td>
        <td style="padding:0 0 14px;"><b>${escapeHtml(lead)}</b> ${escapeHtml(rest)}</td>
      </tr>`,
    )
    .join("");

  return sequenceEmail({
    to,
    subject: "Your first lesson, in four steps",
    preheader: "Everything it takes, start to finish. Your two free lessons are waiting.",
    headline: "Ready when you are. <em>Here's how it goes.</em>",
    body: `${para(greeting(firstName))}
      ${para(intro)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4eff5;border-radius:10px;margin:0 0 16px;">
        <tr><td style="padding:18px 20px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${L_SANS};font-size:16px;line-height:1.5;color:#412e28;">${stepRows}</table>
          <a href="${recordGuide}" style="display:inline-block;margin:0 0 16px;font-size:14px;font-weight:700;color:#2f5d7c;text-decoration:none;">&#9654;&nbsp;Watch: Record a lesson</a>
        </td></tr>
      </table>
      ${para(outro)}
      <p style="margin:8px 0 24px;">${button(startUrl, "Add your first student")}</p>`,
    text: [
      greeting(firstName),
      intro,
      steps.map(([lead, rest], i) => `${i + 1}. ${lead} ${rest}`).join("\n") + `\n\nWatch: Record a lesson - ${recordGuide}`,
      outro,
      `Add your first student: ${startUrl}`,
    ],
    audience: { kind: "account", unsubscribeUrl },
  });
}

/**
 * Email 7 — Millie's check-in, three days after sign-up with nothing recorded.
 * We don't take replies, so "what's in the way?" is answered by clicking one of
 * the links (src/lib/check-in.ts).
 */
export function checkInEmail(
  to: string,
  firstName: string | null,
  unsubscribeUrl: string,
  answerUrl: (reason: StuckReason) => string,
): LifecycleEmail {
  const paragraphs = [
    "I'm Millie, one of the two people behind BumbleNote. I teach English online too, so I know how full a tutor's week can get.",
    "You made your account a few days ago but haven't recorded a lesson yet. That's completely fine. But if something's in the way, I'd love to know, so we can make it easier.",
  ];
  const ask = "Which of these sounds most like you? One click is all it takes, and it'll take you to a quick answer.";
  const thanks = "Thank you for giving BumbleNote a look.";

  const options = STUCK_REASONS.map(
    (r) => `<tr><td style="padding:0 0 8px;">
        <a href="${escapeHtml(answerUrl(r))}" style="display:block;border:1px solid #eadfce;border-radius:10px;padding:12px 16px;color:#412e28;font-weight:700;text-decoration:none;background:#fff7d9;">${escapeHtml(STUCK_LABEL[r])}&nbsp;&rarr;</a>
      </td></tr>`,
  ).join("");

  return sequenceEmail({
    to,
    subject: "Is anything in the way?",
    preheader: "A quick note from Millie, and one click to tell us.",
    headline: "A quick note <em>from Millie.</em>",
    body: `${para(greeting(firstName))}
      ${paragraphs.map((p) => para(p)).join("")}
      ${para(ask)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-family:${L_SANS};font-size:15px;line-height:1.4;">${options}</table>
      ${para(thanks, "color:#6b5245;")}`,
    text: [
      greeting(firstName),
      ...paragraphs,
      ask,
      STUCK_REASONS.map((r) => `- ${STUCK_LABEL[r]}: ${answerUrl(r)}`).join("\n"),
      thanks,
    ],
    audience: { kind: "account", unsubscribeUrl },
    signer: "millie",
  });
}

/** Email 8 — what the student gets, an hour after the tutor's first lesson is written up. */
export function firstRecapEmail(to: string, firstName: string | null, unsubscribeUrl: string): LifecycleEmail {
  const lessonsUrl = `${PUBLIC_ORIGIN}/dashboard/lessons`;
  const studentsUrl = `${PUBLIC_ORIGIN}/dashboard/students`;
  const intro =
    "Your first lesson is written up. When you send it, your student gets an email from you with their lesson report attached as a PDF. Here's what's inside:";
  const ticks: [string, string][] = [
    ["New vocabulary", "from the lesson, so the words they met don't slip away."],
    ["What went well,", "so they can see their progress, not just their mistakes."],
    ["Areas to improve,", "picked out from what they actually said."],
    ["Homework,", "to keep them practising until you see them next."],
    ["A note from you,", "in your own words, at the end."],
  ];
  const review = "Nothing reaches your student until you've checked it, and you can change anything first.";
  const tipLead = "One tip:";
  const tip =
    "fill in your student's goals and interests on their profile. BumbleNote uses them to pitch the vocabulary and homework at what they care about, so the next report fits them even better.";

  const tickRows = ticks
    .map(
      ([lead, rest]) => `<tr>
        <td valign="top" style="padding:7px 10px 0 0;"><div style="width:8px;height:8px;border-radius:50%;background:#412e28;border:3px solid #c1d9e6;"></div></td>
        <td style="padding:0 0 10px;"><b>${escapeHtml(lead)}</b> ${escapeHtml(rest)}</td>
      </tr>`,
    )
    .join("");

  return sequenceEmail({
    to,
    subject: "Here's what your student gets",
    preheader: "Your first lesson is written up. Here's what's in the report.",
    headline: "Your first lesson, <em>written up.</em>",
    body: `${para(greeting(firstName))}
      ${para(intro)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7d9;border-radius:10px;margin:0 0 16px;">
        <tr><td style="padding:18px 20px 8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${L_SANS};font-size:16px;line-height:1.5;color:#412e28;">${tickRows}</table></td></tr>
      </table>
      ${para(review)}
      <p style="margin:8px 0 24px;">${button(lessonsUrl, "See my lesson")}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4eff5;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:16px 20px;font-family:${L_SANS};font-size:15px;line-height:1.5;color:#412e28;">
          <b>${escapeHtml(tipLead)}</b> ${escapeHtml(tip)} <a href="${studentsUrl}" style="color:#2f5d7c;font-weight:700;">Go to your students</a>
        </td></tr>
      </table>`,
    text: [
      greeting(firstName),
      intro,
      ticks.map(([lead, rest]) => `- ${lead} ${rest}`).join("\n"),
      review,
      `See my lesson: ${lessonsUrl}`,
      `${tipLead} ${tip} Go to your students: ${studentsUrl}`,
    ],
    audience: { kind: "account", unsubscribeUrl },
  });
}

/**
 * Send up to 100 lifecycle emails in one request (Resend's batch limit). One
 * request rather than one per address, so a whole list goes out at once and a
 * scheduled run stays well inside its 30 seconds.
 *
 * Throws if the request itself fails (nothing was sent; safe to retry). In
 * permissive mode Resend sends the valid emails and reports the ones it refused
 * (a malformed address, say) by index; those are returned rather than thrown,
 * because retrying them can't help.
 */
export async function sendLifecycleBatch(
  kind: string,
  emails: LifecycleEmail[],
): Promise<{ rejected: { index: number; message: string }[] }> {
  if (!emails.length) return { rejected: [] };
  if (emails.length > 100) throw new Error("Resend batches hold at most 100 emails.");
  const { data, error } = await getClient().batch.send(emails, { batchValidation: "permissive" });
  if (error || !data) throw new Error(explainSendError(error?.message));
  const rejected = data.errors ?? [];
  for (let i = 0; i < emails.length - rejected.length; i++) await recordEmailSent(kind);
  return { rejected };
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
