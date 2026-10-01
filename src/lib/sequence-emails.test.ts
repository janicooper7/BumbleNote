// All five launch-sequence emails end the same way: the same signature (sign-off,
// Trustpilot line, socials), and a footer with a working unsubscribe link and
// one-click unsubscribe headers.

import { describe, expect, it } from "vitest";
import {
  accountWelcomeEmail,
  launchBenefitsEmail,
  launchLiveEmail,
  trialEndedEmail,
  waitlistWelcomeEmail,
  type LifecycleEmail,
} from "./email";

const UNSUB = "https://bumblenote.com/unsub?x=1&y=2";

const EMAILS: [string, LifecycleEmail][] = [
  ["1 waitlist welcome", waitlistWelcomeEmail("a@x.io", UNSUB)],
  ["2 we're live", launchLiveEmail("a@x.io", UNSUB)],
  ["3 benefits", launchBenefitsEmail("a@x.io", UNSUB)],
  ["4 account welcome", accountWelcomeEmail("a@x.io", "Anna", UNSUB)],
  ["5 trial finished", trialEndedEmail("a@x.io", "Anna", UNSUB)],
];

/** Everything from the sign-off down, with the per-audience reason line normalised. */
function ending(html: string): string {
  return html
    .slice(html.indexOf("Millie &amp; Jani"))
    .replace(/You're getting this because [^.]+\./, "REASON");
}

describe("launch-sequence emails", () => {
  it.each(EMAILS)("%s has the shared signature and an unsubscribe link", (_, e) => {
    expect(e.html).toContain("Co-founders, BumbleNote");
    expect(e.html).toContain("Trustpilot");
    expect(e.html).toContain("Follow along:");
    expect(e.html).toContain(`href="${UNSUB.replace(/&/g, "&amp;")}"`);
    expect(e.headers?.["List-Unsubscribe"]).toBe(`<${UNSUB}>`);
    expect(e.text).toContain("Millie & Jani\nCo-founders, BumbleNote");
    expect(e.text).toMatch(/Unsubscribe: https:\/\/bumblenote\.com\/unsub\?x=1&y=2$/);
  });

  it("all end identically, apart from who the footer says it's for", () => {
    const endings = new Set(EMAILS.map(([, e]) => ending(e.html)));
    expect(endings.size).toBe(1);
  });
});
