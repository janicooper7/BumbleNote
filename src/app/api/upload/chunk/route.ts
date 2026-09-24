// Receive one ~4 MB slice of a lesson audio track and store it as a single blob.
// Each request stays well under Netlify's 6 MB function-body limit; the parts are
// reassembled later by the background worker. Auth: session (web) or Bearer
// capture token (extension), via resolveTutorId.

import type { NextRequest } from "next/server";
import { resolveTutorId } from "@/lib/upload-auth";
import { uploadStore, chunkKey, type ChunkMetadata, type Track } from "@/lib/upload-store";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

// uploadId is used as a blob key segment — keep it to an unguessable, safe charset.
const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Which parts of an upload have already arrived, so a resumed upload (see
 * lib/pending-uploads) sends only the missing ones. A blob write is atomic, so a
 * part that's listed is a whole part. The unguessable uploadId is the capability,
 * exactly as it is for writing chunks.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const tutorId = await resolveTutorId(req);
  if (!tutorId) return json({ error: "Unauthorized." }, 401);

  const uploadId = req.nextUrl.searchParams.get("uploadId") ?? "";
  if (!ID_RE.test(uploadId)) return json({ error: "Bad uploadId." }, 400);

  const parts: Record<Track, number[]> = { student: [], tutor: [] };
  const { blobs } = await uploadStore().list({ prefix: `${uploadId}/chunk/` });
  for (const { key } of blobs) {
    const [, , track, part] = key.split("/");
    if (track === "student" || track === "tutor") parts[track].push(Number(part));
  }
  return json({ parts });
}

export async function POST(req: NextRequest): Promise<Response> {
  const tutorId = await resolveTutorId(req);
  if (!tutorId) return json({ error: "Unauthorized." }, 401);

  const { searchParams } = req.nextUrl;
  const uploadId = searchParams.get("uploadId") ?? "";
  const track = searchParams.get("track") as Track | null;
  const part = Number(searchParams.get("part"));

  if (!ID_RE.test(uploadId)) return json({ error: "Bad uploadId." }, 400);
  if (track !== "student" && track !== "tutor") return json({ error: "Bad track." }, 400);
  if (!Number.isInteger(part) || part < 0 || part > 10000) {
    return json({ error: "Bad part index." }, 400);
  }

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) return json({ error: "Empty chunk." }, 400);

  // Stamp the write time: if the client never calls /complete, this chunk is all
  // the sweep has to age the abandoned upload by. See src/lib/upload-retention.
  await uploadStore().set(chunkKey(uploadId, track, part), body, {
    metadata: { at: Date.now() } satisfies ChunkMetadata,
  });
  return json({ ok: true });
}
