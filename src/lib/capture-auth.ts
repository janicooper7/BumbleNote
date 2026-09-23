// Resolves a capture Bearer token to a tutor. Used by the extension's API routes,
// which authenticate with a token instead of a session cookie. Server-only.
//
// `tutors.capture_token` holds the SHA-256 of the token, never the token itself —
// the same rule as password-reset tokens (src/lib/reset-tokens.ts), so a leaked
// database dump can't be replayed as upload credentials. Whatever issues tokens
// must store `hashCaptureToken(token)` and show the raw value to the tutor once.

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tutors } from "@/db/schema";

export function hashCaptureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function tutorIdByCaptureToken(token: string): Promise<string | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: tutors.id })
    .from(tutors)
    .where(eq(tutors.captureToken, hashCaptureToken(token)))
    .limit(1);
  return row?.id ?? null;
}
