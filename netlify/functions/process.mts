// Background worker for the lesson-audio pipeline.
//
// The web app / extension chunk-upload two audio tracks to Netlify Blobs, then
// /api/upload/complete kicks this function. Running as a *background* function
// gives us the 15-minute budget the synchronous 26–60 s routes don't have, so we
// can transcribe (Deepgram) + draft (Claude) a full lesson here. On finish we
// write the poll status and delete the audio — implementing the "audio is
// transient" privacy rule in PLAN.md §9.
//
// Reuses the exact same app code the local dev path uses:
//   - transcribeLesson       (@/lib/stt)
//   - createDraftLessonCore  (@/lib/lessons) — the revalidatePath-free variant,
//                             since next/cache has no request context out here.
//
// Netlify auto-retries a background function that throws, which would double-
// insert lessons — so every path here is caught and reported via the status blob,
// and the function never throws.

import type { Config } from "@netlify/functions";
import { alertOperator } from "@/lib/alerts";
import { transcribeLesson } from "@/lib/stt";
// Import the Next-free core directly (NOT @/lib/lessons) so this bundle never
// pulls in `next/cache`, which isn't resolvable in a standalone function.
import { createDraftLessonCore } from "@/lib/lessons-core";
import {
  uploadStore,
  chunkKey,
  jobKey,
  statusKey,
  transcriptKey,
  allChunkKeys,
  clearLessonFailed,
  markLessonFailed,
  type Track,
  type UploadJob,
  type UploadStatus,
} from "@/lib/upload-store";

// Background function (15-min budget). Invoked at its canonical URL
// /.netlify/functions/process by /api/upload/complete. No custom `path` — the
// Next.js plugin owns pretty-path routing, so we use the reserved functions URL
// which Netlify's function router always resolves.
export const config: Config = {
  background: true,
};

async function readTrack(
  store: ReturnType<typeof uploadStore>,
  uploadId: string,
  track: Track,
  count: number,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const buf = (await store.get(chunkKey(uploadId, track, i), {
      type: "arrayBuffer",
      consistency: "strong",
    })) as ArrayBuffer | null;
    if (!buf) throw new Error(`Missing ${track} audio chunk ${i}.`);
    parts.push(Buffer.from(buf));
  }
  return Buffer.concat(parts);
}

const handler = async (req: Request): Promise<Response> => {
  // Read the secret directly (not via env.required) so a missing env var is a
  // logged 500, not an uncaught throw before our try/catch.
  const secret = process.env.INTERNAL_TASK_SECRET;
  if (!secret) {
    console.error("[process] INTERNAL_TASK_SECRET is not set in the environment.");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (req.headers.get("x-internal-secret") !== secret) {
    console.warn("[process] rejected: bad or missing x-internal-secret header.");
    return new Response("Forbidden", { status: 403 });
  }

  let uploadId = "";
  // store is created inside the try so a Blobs failure is caught + logged, not an
  // uncaught crash (a background function has already returned 202 by then).
  let store: ReturnType<typeof uploadStore> | undefined;
  // Hoisted out of the try purely so the operator alert in the catch can say
  // whose lesson this was. Empty until the job blob is read, which is itself one
  // of the steps that can fail.
  let tutorId = "";
  let studentId = "";
  let durationMin = 0;

  try {
    ({ uploadId } = (await req.json()) as { uploadId: string });
    console.log(`[process] start uploadId=${uploadId}`);
    if (!uploadId) return new Response("Missing uploadId", { status: 400 });

    store = uploadStore();
    console.log("[process] blob store ready");

    const job = (await store.get(jobKey(uploadId), {
      type: "json",
      consistency: "strong",
    })) as UploadJob | null;
    if (!job) {
      console.error(`[process] job blob not found for ${uploadId}`);
      return new Response("Unknown job", { status: 404 });
    }
    ({ tutorId, studentId, durationMin } = job);
    console.log(
      `[process] job loaded student=${job.studentId} parts=${job.parts.student}/${job.parts.tutor}`,
    );

    // A previous attempt may have transcribed successfully and then died in the
    // drafting step. Reuse that transcript rather than re-billing Deepgram for
    // both tracks — retries of a long lesson are otherwise expensive.
    let transcript = (await store.get(transcriptKey(uploadId), {
      type: "text",
      consistency: "strong",
    })) as string | null;

    if (transcript) {
      console.log(
        `[process] reusing cached transcript (${transcript.length} chars) — skipping Deepgram`,
      );
    } else {
      const [studentAudio, tutorAudio] = await Promise.all([
        readTrack(store, uploadId, "student", job.parts.student),
        readTrack(store, uploadId, "tutor", job.parts.tutor),
      ]);
      console.log(
        `[process] audio assembled student=${studentAudio.length}B tutor=${tutorAudio.length}B — calling Deepgram`,
      );

      // trimMaps put the word timestamps of each silence-trimmed track back onto
      // real lesson time; without them the two speakers are interleaved against
      // two different compressed clocks. Absent for untrimmed (or pre-trimming)
      // jobs, where the timestamps are already real.
      transcript = await transcribeLesson({
        studentAudio,
        tutorAudio,
        trimMaps: job.trimMaps,
      });
      await store.set(transcriptKey(uploadId), transcript);
      console.log(`[process] transcript ready (${transcript.length} chars) — cached`);
    }
    console.log("[process] calling Claude");

    const { id } = await createDraftLessonCore(job.tutorId, {
      studentId: job.studentId,
      transcript,
      durationMin: job.durationMin,
    });
    console.log(`[process] draft created lesson=${id}`);

    await store.setJSON(statusKey(uploadId), {
      state: "done",
      lessonId: id,
    } satisfies UploadStatus);

    // Drop the audio and the cached transcript; keep the tiny job + status blobs
    // for the client's poll. A retried lesson also leaves the tutor's Retry list.
    await Promise.all([
      ...[...allChunkKeys(uploadId, job.parts), transcriptKey(uploadId)].map((key) =>
        store!.delete(key),
      ),
      clearLessonFailed(job.tutorId, uploadId),
    ]);
    console.log(`[process] complete uploadId=${uploadId}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Processing failed.";
    console.error(`[process] FAILED uploadId=${uploadId}:`, err);
    if (store && uploadId) {
      // The audio and any cached transcript stay put, so /api/admin/recover can
      // re-run this lesson instead of the tutor losing it. `failedAt` starts the
      // clock that eventually deletes them anyway — see src/lib/upload-retention.
      await store
        .setJSON(statusKey(uploadId), {
          state: "error",
          error,
          failedAt: Date.now(),
        } satisfies UploadStatus)
        .catch((e) => console.error("[process] could not write error status:", e));
    }
    if (uploadId && tutorId) {
      // Surfaces the lesson on the tutor's dashboard with a Retry button.
      await markLessonFailed(uploadId, { tutorId, studentId, durationMin });
    }

    // The alert that matters most: the tutor is staring at a failed lesson they
    // can't fix themselves, and the audio is recoverable only until the
    // retention sweep takes it. Fingerprinted on the error text alone — one
    // broken upstream shouldn't send one email per lesson — so the uploadId in
    // the body is an example of the failure, not necessarily the only one.
    await alertOperator({
      subject: "Lesson processing failed",
      summary:
        "A lesson finished uploading but the background worker couldn't turn it " +
        "into a draft. The audio is still in storage: the tutor sees a Retry button " +
        "on their dashboard, and /api/admin/recover can re-run it too, until the " +
        "retention sweep deletes it.",
      fingerprint: `process:${error}`,
      fields: {
        Error: error,
        "Upload id": uploadId,
        "Tutor id": tutorId,
        "Student id": studentId,
        Recover: "GET /api/admin/recover to list, POST ?uploadId=… to re-run",
      },
    });
  }

  // Always 202: never throw, or Netlify retries and we double-insert.
  return new Response(null, { status: 202 });
};

export default handler;
