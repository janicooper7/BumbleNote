// POST /api/upload/retry?uploadId=… — a tutor re-runs one of their own lessons
// whose processing failed. Returns immediately; the client then polls
// /api/upload/status exactly as it does after a first upload.
// Auth: session (web) or Bearer capture token (extension).

import type { NextRequest } from "next/server";
import { restartProcessing } from "@/lib/failed-lessons";
import { resolveTutorId } from "@/lib/upload-auth";

export async function POST(req: NextRequest): Promise<Response> {
  const tutorId = await resolveTutorId(req);
  if (!tutorId) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const uploadId = req.nextUrl.searchParams.get("uploadId")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(uploadId)) {
    return Response.json({ error: "Bad uploadId." }, { status: 400 });
  }

  const result = await restartProcessing(uploadId, tutorId, req.nextUrl.origin);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ uploadId });
}
