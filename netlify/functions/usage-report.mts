// Scheduled spend report (src/lib/usage-report.ts), emailed to the operator.
//
// Every morning: yesterday's spend, UK day. On the 1st of the month: the whole
// previous month as well, as a second email.
//
// 06:05 UTC is 07:05 in summer and 06:05 in winter: after the UK day it reports
// on has ended either way, and early enough to act on before tutors start. The
// email doubles as a dead man's switch: if it doesn't arrive, Netlify, Neon or
// Resend is down.

import type { Config } from "@netlify/functions";
import { alertOperator } from "@/lib/alerts";
import { sendUsageReportEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { buildUsageReport, dayPeriod, londonToday, monthPeriod, type Period } from "@/lib/usage-report";

export const config: Config = {
  schedule: "5 6 * * *",
};

export default async function handler(): Promise<Response> {
  const to = env.ALERT_EMAIL;
  if (!to) {
    console.warn("[usage-report] no ALERT_EMAIL or ADMIN_EMAILS set; not sending.");
    return new Response(null, { status: 200 });
  }

  const { y, m, d } = londonToday();
  const periods: Period[] = [dayPeriod(y, m, d - 1)];
  if (d === 1) periods.push(monthPeriod(y, m - 1));

  // Each report on its own: a failed daily mustn't cost the monthly.
  for (const period of periods) {
    try {
      const report = await buildUsageReport(period);
      await sendUsageReportEmail(to, report);
      console.log(`[usage-report] sent ${period.kind} ${period.label}: ${report.subject}`);
    } catch (err) {
      // Never throw: Netlify would retry, and the retry would double-send any
      // report that did go out. Tomorrow's run is the retry.
      console.error(`[usage-report] ${period.kind} ${period.label} FAILED:`, err);
      await alertOperator({
        subject: "Spend report failed",
        summary: `The ${period.kind === "day" ? "daily" : "monthly"} spend report for ${period.label} couldn't be built or sent.`,
        fingerprint: `usage-report:${period.kind}`,
        fields: { Error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return new Response(null, { status: 200 });
}
