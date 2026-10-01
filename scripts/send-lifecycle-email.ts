// Launch-sequence emails (src/lib/lifecycle-emails.ts), by hand. Normally the
// scheduled function netlify/functions/lifecycle-emails.mts sends them; this is
// for previews, and for sending a waitlist email now if that run fails. Safe to
// re-run: rows are claimed before sending, so nobody gets an email twice.
//
//   npx tsx scripts/send-lifecycle-email.ts                    (dry run: who's still due)
//   npx tsx scripts/send-lifecycle-email.ts --test you@x.com   (all five, to you only)
//   npx tsx scripts/send-lifecycle-email.ts --send live        (email 2 to the waitlist now)
//   npx tsx scripts/send-lifecycle-email.ts --send benefits    (email 3 to the waitlist now)
//
// Needs DATABASE_URL and RESEND_API_KEY from .env.local, pointed at production,
// and migration 0028 applied there. Set MARKETING_EMAIL_FROM to send from
// somewhere other than EMAIL_FROM.

import { config } from "dotenv";
import {
  accountWelcomeEmail,
  launchBenefitsEmail,
  launchLiveEmail,
  sendLifecycleBatch,
  trialEndedEmail,
  waitlistWelcomeEmail,
} from "../src/lib/email";
import {
  countWaitlistPending,
  sendLaunchBenefits,
  sendLaunchLive,
  tutorUnsubscribeUrl,
  type SendOutcome,
} from "../src/lib/lifecycle-emails";
import { unsubscribeUrl } from "../src/lib/waitlist-welcome";

// Nothing above reads env at import time (db connects lazily), so loading it
// here is early enough.
config({ path: ".env.local" });
config();

/** Points at no row, so the preview's unsubscribe links do nothing. */
const NOBODY = "00000000-0000-4000-8000-000000000000";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function report(o: SendOutcome): void {
  console.log(`${o.kind}: sent ${o.sent}.`);
  for (const r of o.rejected) console.error(`  refused ${r}`);
  if (o.failed) console.error(`  FAILED: ${o.failed} (re-run to retry)`);
}

async function main() {
  const test = arg("--test");
  if (test !== undefined) {
    if (!test.includes("@")) throw new Error("Usage: --test you@example.com");
    await sendLifecycleBatch("preview", [
      waitlistWelcomeEmail(test, unsubscribeUrl(NOBODY)),
      launchLiveEmail(test, unsubscribeUrl(NOBODY)),
      launchBenefitsEmail(test, unsubscribeUrl(NOBODY)),
      accountWelcomeEmail(test, "Millie", tutorUnsubscribeUrl(NOBODY)),
      trialEndedEmail(test, "Millie", tutorUnsubscribeUrl(NOBODY)),
    ]);
    console.log(`Previews of emails 1-5 sent to ${test}.`);
    return;
  }

  const send = arg("--send");
  if (send === "live") return report(await sendLaunchLive());
  if (send === "benefits") return report(await sendLaunchBenefits());
  if (send !== undefined) throw new Error('--send takes "live" or "benefits".');

  const { live, benefits } = await countWaitlistPending();
  console.log(`Still due "we're live": ${live}. Still due "why tutors use it" (no account yet): ${benefits}.`);
  console.log("Dry run. Use --test you@x.com for previews, or --send live|benefits to send now.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
