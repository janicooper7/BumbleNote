"use server";

// The dashboard's "Get in touch" button: emails the tutor's message to the
// operator (env.FEEDBACK_EMAIL). Nothing is stored — the inbox is the record.

import { currentTutorId } from "@/auth";
import { getTutor } from "@/db/queries";
import { env } from "@/lib/env";
import { sendFeedbackEmail, type ContactTopic } from "@/lib/email";
import { rateLimit, waitText } from "@/lib/rate-limit";

// Mirrored by the textarea's maxLength in FeedbackButton.
const MAX_FEEDBACK_LENGTH = 4000;
const TOPICS: readonly ContactTopic[] = ["problem", "feedback", "question"];

/** Returned as values, not thrown — Next redacts thrown messages in production. */
export type FeedbackResult = { ok: true } | { ok: false; error: string };

export async function sendFeedback(input: {
  message: string;
  page: string;
  topic?: ContactTopic;
}): Promise<FeedbackResult> {
  const tutorId = await currentTutorId();
  const message = String(input.message ?? "").trim();
  const page = String(input.page ?? "").slice(0, 200) || "/dashboard";
  // Optional, and checked: it's interpolated into the email subject.
  const topic = TOPICS.find((t) => t === input.topic);

  if (!message) return { ok: false, error: "Write a few words first." };
  if (message.length > MAX_FEEDBACK_LENGTH) {
    return { ok: false, error: `Please keep it under ${MAX_FEEDBACK_LENGTH} characters.` };
  }

  const to = env.FEEDBACK_EMAIL;
  if (!to) return { ok: false, error: "Messages aren't set up yet — please try again later." };

  // Plenty for a real person; stops a stuck client from flooding the inbox.
  const limited = await rateLimit({ key: `feedback:tutor:${tutorId}`, limit: 10, windowSec: 60 * 60 });
  if (!limited.ok) {
    return {
      ok: false,
      error: `That's a lot of messages at once — try again in ${waitText(limited.retryAfterSec)}.`,
    };
  }

  const tutor = await getTutor();
  if (!tutor) return { ok: false, error: "Couldn't find your account — please sign in again." };

  try {
    await sendFeedbackEmail({
      to,
      tutorName: tutor.name || "A tutor",
      tutorEmail: tutor.email,
      message,
      page,
      topic,
    });
  } catch (err) {
    console.error("could not send feedback", err);
    return { ok: false, error: "Couldn't send that — please try again." };
  }
  return { ok: true };
}
