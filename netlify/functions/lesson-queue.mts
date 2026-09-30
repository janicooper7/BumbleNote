// Scheduled sweep of the transcription queue (src/lib/lesson-queue.ts).
//
// A worker waits for a transcription slot for a couple of minutes, then exits
// and leaves its lesson queued. Every minute this starts a fresh worker for each
// queued lesson that has nobody waiting on it, oldest first, so a long queue
// keeps moving without any one worker running out of time.
//
// Also the queue's alarm: a lesson waiting this long means slots aren't being
// given back, or Deepgram is refusing everything.

import type { Config } from "@netlify/functions";
import { alertOperator } from "@/lib/alerts";
import { oldestWaitMinutes, startWorker, takeOrphans } from "@/lib/lesson-queue";

export const config: Config = {
  schedule: "* * * * *",
};

const SLOW_QUEUE_MIN = 20;

export default async function handler(): Promise<Response> {
  // URL is set by Netlify on every function. Not @/lib/app-url: it imports
  // next/headers, which a standalone function can't resolve.
  const origin = (process.env.URL || process.env.APP_URL || "https://bumblenote.com")
    .trim()
    .replace(/\/+$/, "");
  try {
    const orphans = await takeOrphans();
    for (const { uploadId } of orphans) {
      try {
        await startWorker(origin, uploadId);
        console.log(`[lesson-queue] restarted worker for ${uploadId}`);
      } catch (err) {
        // Picked up again next minute: takeOrphans only marked it as touched.
        console.error(`[lesson-queue] could not start worker for ${uploadId}:`, err);
      }
    }

    const waited = await oldestWaitMinutes();
    if (waited > SLOW_QUEUE_MIN) {
      await alertOperator({
        subject: "Lessons are stuck in the transcription queue",
        summary:
          `A lesson has been waiting ${Math.round(waited)} minutes for a transcription ` +
          "slot. Either slots aren't being given back (see lesson_jobs rows in state " +
          "'transcribing') or every Deepgram call is failing.",
        fingerprint: "lesson-queue:slow",
        fields: { "Longest wait (min)": Math.round(waited) },
      });
    }
  } catch (err) {
    // Never throw: Netlify would retry, and next minute's run is the retry.
    console.error("[lesson-queue] FAILED:", err);
  }
  return new Response(null, { status: 200 });
}
