// Scheduled sweep of the lesson-audio store.
//
// Enforces the retention promise in the privacy policy: audio from a failed or
// abandoned upload is deleted AUDIO_RETENTION_MS after its last sign of life.
// Successful lessons never reach this function — the worker deletes their audio
// the moment the notes exist.
//
// Runs daily. The exact minute is arbitrary and off the hour on purpose, to sit
// away from the platform's busiest cron slots.

import type { Config } from "@netlify/functions";
import { alertOperator } from "@/lib/alerts";
import { purgeExpiredUploads } from "@/lib/upload-retention";

export const config: Config = {
  schedule: "17 3 * * *",
};

export default async function handler(): Promise<Response> {
  try {
    const report = await purgeExpiredUploads();
    console.log(
      `[purge] scanned=${report.scanned} expired=${report.expired} ` +
        `strays=${report.strays} deleted=${report.deleted}`,
    );
  } catch (err) {
    // Log and exit cleanly. A throw would have Netlify retry the sweep, and a
    // sweep that can't reach the store won't do better on the second attempt —
    // tomorrow's run picks up whatever was missed.
    console.error("[purge] FAILED:", err);

    // Worth an email even though the next run may well fix it: this sweep is
    // what makes the privacy policy's audio-retention promise true, and it runs
    // once a day with nobody watching. Several days of silent failures is
    // undeleted student audio, which is a commitment broken rather than a bug.
    await alertOperator({
      subject: "Audio retention sweep failed",
      summary:
        "The daily purge of expired lesson audio didn't complete. One failure is " +
        "recoverable — tomorrow's run catches up — but repeated failures mean " +
        "student audio is outliving the retention window stated in the privacy policy.",
      fingerprint: "purge:failed",
      fields: { Error: err instanceof Error ? err.message : String(err) },
    });
  }

  return new Response(null, { status: 200 });
}
