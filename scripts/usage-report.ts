// Preview (or send) the spend report that netlify/functions/usage-report.mts
// emails every morning.
//
//   npx tsx scripts/usage-report.ts                     yesterday, printed
//   npx tsx scripts/usage-report.ts --day 2026-10-04    a given UK day
//   npx tsx scripts/usage-report.ts --month 2026-10     a given month
//   ... --send                                          also email it to ALERT_EMAIL
//
// Reads .env.local. Point DATABASE_URL at production to see real numbers.

import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  // Imported after dotenv so env-reading modules see the values.
  const { buildUsageReport, dayPeriod, londonToday, monthPeriod } = await import("../src/lib/usage-report");
  const { sendUsageReportEmail } = await import("../src/lib/email");
  const { env } = await import("../src/lib/env");

  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };

  const day = arg("--day");
  const month = arg("--month");
  let period;
  if (month) {
    const [y, m] = month.split("-").map(Number);
    period = monthPeriod(y, m - 1);
  } else if (day) {
    const [y, m, d] = day.split("-").map(Number);
    period = dayPeriod(y, m - 1, d);
  } else {
    const { y, m, d } = londonToday();
    period = dayPeriod(y, m, d - 1);
  }

  const report = await buildUsageReport(period);
  console.log(`\n${report.subject}\n${"=".repeat(report.subject.length)}`);
  for (const w of report.warnings) console.log(`! ${w}`);
  for (const [k, v] of report.headline) console.log(`${k.padEnd(32)} ${v}`);
  for (const s of report.sections) {
    console.log(`\n${s.title}`);
    for (const [k, v] of s.rows) console.log(`  ${k.padEnd(30)} ${v}`);
  }

  if (process.argv.includes("--send")) {
    await sendUsageReportEmail(env.ALERT_EMAIL, report);
    console.log(`\nSent to ${env.ALERT_EMAIL}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
