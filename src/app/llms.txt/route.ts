// /llms.txt — a plain-Markdown summary of the product for AI assistants and AI
// search (https://llmstxt.org), the way robots.txt and the sitemap are for
// crawlers.
//
// The proxy's matcher skips any path with a dot in it, so the pre-launch gate
// never sees this route. It has to keep itself private: while the gate is up it
// answers 404, exactly as if it didn't exist.
//
// Built from the same modules the homepage reads (FAQ, plans, prices), so it
// can't advertise anything the page and checkout don't.

import { SITE_URL } from "@/lib/app-url";
import { FAQS } from "@/lib/faq";
import { PLANS } from "@/lib/plans";
import { PAID_PLAN_IDS, PLAN_PRICES_USD } from "@/lib/pricing";
import { gateEnabled } from "@/lib/site-gate";
import { SITE_DESCRIPTION } from "@/lib/site-meta";

export const dynamic = "force-static";

export function GET() {
  if (gateEnabled()) return new Response("Not found", { status: 404 });

  const plans = PAID_PLAN_IDS.map((id) => {
    const price = PLAN_PRICES_USD[id];
    return `- ${PLANS[id].name}: $${price.month}/month or $${price.year}/year, up to ${PLANS[id].lessons} lessons a month`;
  });

  const body = [
    "# BumbleNote",
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "BumbleNote is for online English tutors who teach 1-to-1 lessons in a browser tab (Google Meet, Zoom or Teams on the web, Preply, italki, Cambly). It records the lesson in the browser, keeps the tutor's and student's voices apart, and writes a recap for the student plus private notes for the tutor.",
    "",
    "## Pricing",
    "",
    `- Free trial: ${PLANS.free.students} student, ${PLANS.free.lessons} lessons, no card required`,
    ...plans,
    "",
    "## FAQ",
    "",
    ...FAQS.flatMap((f) => [`### ${f.q}`, "", f.a, ""]),
    "## Pages",
    "",
    `- [Home](${SITE_URL}/): what it does, how it works, pricing and FAQ`,
    `- [Sign up](${SITE_URL}/signup): start the free trial`,
    `- [Terms of Service](${SITE_URL}/terms)`,
    `- [Privacy Policy](${SITE_URL}/privacy)`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
