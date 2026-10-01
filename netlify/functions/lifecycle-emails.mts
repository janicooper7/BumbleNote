// Launch-sequence emails 2–5 (src/lib/lifecycle-emails.ts): the two waitlist
// emails on their launch-week dates, and the welcome and trial-finished sweeps.
//
// Hourly, on the hour: the waitlist emails go out on the run they're due
// (Netlify schedules are UTC; 08:00 UTC is 9am UK until the clocks change on
// 25 October), and the trial-finished email lands within an hour of its time.
// Not more often: every run queries Neon, and a query every few minutes would
// keep the database from ever scaling to zero.

import type { Config } from "@netlify/functions";
import { alertOperator } from "@/lib/alerts";
import { runLifecycleEmails } from "@/lib/lifecycle-emails";

export const config: Config = {
  schedule: "0 * * * *",
};

export default async function handler(): Promise<Response> {
  // Never throw: a Netlify retry could double-send. The next run is the retry.
  try {
    for (const o of await runLifecycleEmails()) {
      if (o.sent) console.log(`[lifecycle-emails] ${o.kind}: sent ${o.sent}.`);
      if (!o.failed && !o.rejected.length) continue;
      console.error(`[lifecycle-emails] ${o.kind}:`, o.failed ?? "", o.rejected);
      await alertOperator({
        subject: `Email "${o.kind}" ${o.failed ? "failed" : "refused some addresses"}`,
        summary: o.failed
          ? `The ${o.kind} email couldn't be sent. The next run (in an hour) retries it.`
          : `Resend refused ${o.rejected.length} ${o.kind} email(s). They won't be retried.`,
        fingerprint: `lifecycle-emails:${o.kind}`,
        fields: { Sent: o.sent, Error: o.failed, Refused: o.rejected.join(" | ") || undefined },
      });
    }
  } catch (err) {
    console.error("[lifecycle-emails] FAILED:", err);
    await alertOperator({
      subject: "Lifecycle emails failed",
      summary: "The lifecycle-emails run crashed. The next run (in an hour) retries it.",
      fingerprint: "lifecycle-emails",
      fields: { Error: err instanceof Error ? err.message : String(err) },
    });
  }
  return new Response(null, { status: 200 });
}
