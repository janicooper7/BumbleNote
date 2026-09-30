// GET /api/upload/active — the tutor's lessons between upload and draft: waiting
// for a transcription slot (with their place in line), or being processed. The
// dashboard's lesson tracker (components/dashboard/PendingUploads) seeds itself
// from this, so lessons started in another tab or before a reload still show.

import type { NextRequest } from "next/server";
import { lessonJobsFor } from "@/lib/lesson-queue";
import { resolveTutorId } from "@/lib/upload-auth";

export async function GET(req: NextRequest): Promise<Response> {
  const tutorId = await resolveTutorId(req);
  if (!tutorId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  return Response.json({ lessons: await lessonJobsFor(tutorId) });
}
