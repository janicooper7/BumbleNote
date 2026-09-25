// POST /api/upload/dismiss?uploadId=… — a tutor drops one of their own failed
// lessons from the dashboard (a false start, a test call) and its stored audio
// is deleted now instead of at the end of the retention window.
// Auth: session (web) or Bearer capture token (extension).

import type { NextRequest } from "next/server";
import { dismissFailedLesson } from "@/lib/failed-lessons";
import { resolveTutorId } from "@/lib/upload-auth";

export async function POST(req: NextRequest): Promise<Response> {
  const tutorId = await resolveTutorId(req);
  if (!tutorId) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const uploadId = req.nextUrl.searchParams.get("uploadId")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(uploadId)) {
    return Response.json({ error: "Bad uploadId." }, { status: 400 });
  }

  const result = await dismissFailedLesson(uploadId, tutorId);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ uploadId });
}
