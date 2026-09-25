// Sends the waitlist welcome email to everyone who hasn't had it yet — the people
// who joined before joinWaitlist started sending it. Safe to re-run: each row is
// claimed before sending (src/lib/waitlist-welcome.ts), so nobody gets it twice.
//
//   npx tsx scripts/send-waitlist-welcome.ts          (dry run: count only)
//   npx tsx scripts/send-waitlist-welcome.ts --send   (actually send)
//
// Needs DATABASE_URL and RESEND_API_KEY from .env.local, pointed at production,
// and migration 0021 applied there. Set MARKETING_EMAIL_FROM to send from
// somewhere other than EMAIL_FROM.

import { config } from "dotenv";
import { isNull } from "drizzle-orm";
import { db, schema } from "../src/db";
import { sendWaitlistWelcome } from "../src/lib/waitlist-welcome";

// Nothing above reads env at import time (db connects lazily), so loading it
// here is early enough.
config({ path: ".env.local" });
config();

/** Resend's default limit is 2 requests a second; stay under it. */
const GAP_MS = 600;

async function main() {
  const send = process.argv.includes("--send");

  const pending = await db
    .select({ id: schema.waitlist.id })
    .from(schema.waitlist)
    .where(isNull(schema.waitlist.welcomeSentAt))
    .orderBy(schema.waitlist.createdAt);

  console.log(`${pending.length} waitlist address(es) haven't had the welcome email.`);
  if (!send) {
    console.log("Dry run. Re-run with --send to send it.");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const { id } of pending) {
    try {
      if (await sendWaitlistWelcome(id)) sent++;
    } catch (err) {
      failed++;
      console.error(`Failed for row ${id}:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  console.log(`Sent ${sent}, failed ${failed}. Re-run to retry failures.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
