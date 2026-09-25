// Poll the state of a chunked upload's background processing. The client calls
// this every few seconds until state is "done" (then navigates to the draft) or
// "error". Auth: session (web) or Bearer capture token (extension). A tutor may
// only read their own upload's status.

import type { NextRequest } from "next/server";
import { releaseLesson } from "@/lib/quota";
import { resolveTutorId } from "@/lib/upload-auth";
import {
  uploadStore,
  jobKey,
  statusKey,
  STALL_AFTER_MS,
  markLessonFailed,
  type UploadJob,
  type UploadStatus,
} from "@/lib/upload-store";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest): Promise<Response> {
  const tutorId = await resolveTutorId(req);
  if (!tutorId) return json({ error: "Unauthorized." }, 401);

  const uploadId = req.nextUrl.searchParams.get("uploadId") ?? "";
  if (!uploadId) return json({ error: "Missing uploadId." }, 400);

  const store = uploadStore();

  // The job is deleted once processing finishes, so its absence means either the
  // upload is unknown or already cleaned up — fall through to the status blob.
  const job = (await store.get(jobKey(uploadId), {
    type: "json",
    consistency: "strong",
  })) as UploadJob | null;
  if (job && job.tutorId !== tutorId) return json({ error: "Not found." }, 404);

  const status = (await store.get(statusKey(uploadId), {
    type: "json",
    consistency: "strong",
  })) as UploadStatus | null;
  if (!status) return json({ error: "Unknown upload." }, 404);

  // A worker that is killed rather than thrown out of (platform timeout, OOM, a
  // deploy mid-run) runs no catch block, so it never writes a terminal status and
  // this blob stays "processing" forever. Once the job is older than any healthy
  // run could be, report it as failed — and persist that, so the client, a later
  // poll, and /api/admin/recover all agree. The audio survives either way (the
  // worker only deletes it on success), so the upload stays recoverable.
  if (status.state === "processing" && job?.startedAt && Date.now() - job.startedAt > STALL_AFTER_MS) {
    const stalled: UploadStatus = {
      state: "error",
      error: "Processing stopped unexpectedly. The audio was kept — the lesson can be retried.",
      failedAt: Date.now(),
    };
    await Promise.all([
      store.setJSON(statusKey(uploadId), stalled),
      markLessonFailed(uploadId, job),
      // A killed worker never gave its credit back. The reservation TTL would free
      // it eventually; this frees it now, so a retry doesn't look over the limit.
      releaseLesson(uploadId),
    ]);
    return json(stalled);
  }

  return json(status);
}
