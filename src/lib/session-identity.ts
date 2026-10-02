// Who a sign-in resolves to, and whether an existing session is still good.
// Used by the NextAuth callbacks in src/auth.ts; kept apart so it can be tested
// against real Postgres without loading NextAuth. Node-only (DB).

import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { tutors } from "@/db/schema";

/**
 * Find or create the tutor for a sign-in, returning the session version to
 * stamp on the JWT, and `created` when this sign-in made the account.
 *
 * Password signup never checks that the address belongs to whoever typed it, so
 * a stranger could register a tutor's email first and wait for them to arrive
 * via Google. When Google — which has verified the address — signs into a row
 * whose password was never proven, that password is dropped and every existing
 * session is ended, leaving the account to the person who owns the inbox.
 */
export async function tutorForSignIn(
  email: string,
  name: string,
  viaGoogle: boolean,
): Promise<{ id: string; sessionVersion: number; created?: true }> {
  const [existing] = await db
    .select({
      id: tutors.id,
      sessionVersion: tutors.sessionVersion,
      passwordHash: tutors.passwordHash,
      emailVerifiedAt: tutors.emailVerifiedAt,
    })
    .from(tutors)
    .where(eq(tutors.email, email))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(tutors)
      .values({ email, name, emailVerifiedAt: viaGoogle ? new Date() : null })
      .returning({ id: tutors.id, sessionVersion: tutors.sessionVersion });
    return { ...created, created: true };
  }

  if (!viaGoogle || existing.emailVerifiedAt) return existing;

  const [proven] = await db
    .update(tutors)
    .set(
      existing.passwordHash
        ? {
            emailVerifiedAt: new Date(),
            passwordHash: null,
            sessionVersion: sql`${tutors.sessionVersion} + 1`,
          }
        : { emailVerifiedAt: new Date() },
    )
    .where(eq(tutors.id, existing.id))
    .returning({ id: tutors.id, sessionVersion: tutors.sessionVersion });
  return proven;
}

/**
 * The tutor's current session version, or null if the tutor no longer exists.
 * Cached per request: the dashboard reads the session several times per render.
 */
export const sessionVersionOf = cache(async (tutorId: string): Promise<number | null> => {
  const [row] = await db
    .select({ sessionVersion: tutors.sessionVersion })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  return row?.sessionVersion ?? null;
});
