"use server";

// Server Actions for student mutations. These replace the localStorage
// studentsStore writes. Each is scoped to the current tutor and revalidates the
// dashboard subtree so Server Components re-read fresh data.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { students } from "@/db/schema";
import { currentTutorId } from "@/auth";
import { insertWithUniqueId } from "@/lib/unique-id";
import { assertStudentQuota, isQuotaError } from "@/lib/quota";

export type NewStudentInput = {
  name: string;
  native: string;
  email?: string;
  gender?: "male" | "female";
  level: string;
  goal: string;
  targetExam?: string;
  interests?: string[];
  focus?: string[];
  notes?: string;
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Hitting the student cap is an expected outcome, not a crash, so it comes back
 * as a value. It has to: Next redacts thrown Server Action error messages in
 * production, so a thrown QuotaError would reach the tutor as an anonymous
 * "an error occurred" — no plan, no limit, no way to act on it.
 */
export type CreateStudentResult = { ok: true; id: string } | { ok: false; error: string };

export async function createStudent(input: NewStudentInput): Promise<CreateStudentResult> {
  const tutorId = await currentTutorId();

  try {
    await assertStudentQuota(tutorId);
  } catch (err) {
    if (isQuotaError(err)) return { ok: false, error: err.message };
    throw err;
  }

  const name = input.name.trim();

  // The id is a global primary key, so it has to be unique across every tutor,
  // not just this one — see src/lib/unique-id.ts.
  const id = await insertWithUniqueId(slugify(name) || "student", (candidateId) =>
    db.insert(students).values({
      id: candidateId,
      tutorId,
      name,
      initial: (name[0] || "?").toUpperCase(),
      gender: input.gender ?? null,
      level: input.level,
      goal: input.goal,
      native: input.native.trim() || "—",
      email: input.email?.trim() || null,
      lessonCount: 0,
      vocabCount: 0,
      lastSeen: "New",
      focus: input.focus?.filter(Boolean) ?? [],
      trend: "steady",
      active: true,
      notes: input.notes?.trim() || "",
      targetExam: input.targetExam?.trim() || null,
      interests: input.interests?.filter(Boolean) ?? null,
    }),
  );

  revalidatePath("/dashboard", "layout");
  return { ok: true, id };
}

export async function deleteStudent(id: string): Promise<void> {
  const tutorId = await currentTutorId();
  await db.delete(students).where(and(eq(students.tutorId, tutorId), eq(students.id, id)));
  revalidatePath("/dashboard", "layout");
}

export async function setStudentActive(id: string, active: boolean): Promise<void> {
  const tutorId = await currentTutorId();
  await db
    .update(students)
    .set({ active })
    .where(and(eq(students.tutorId, tutorId), eq(students.id, id)));
  revalidatePath("/dashboard", "layout");
}

export async function setStudentNotes(id: string, notes: string): Promise<void> {
  const tutorId = await currentTutorId();
  await db
    .update(students)
    .set({ notes })
    .where(and(eq(students.tutorId, tutorId), eq(students.id, id)));
  revalidatePath("/dashboard", "layout");
}

export async function setStudentEmail(id: string, email: string): Promise<void> {
  const tutorId = await currentTutorId();
  const trimmed = email.trim();
  await db
    .update(students)
    .set({ email: trimmed || null })
    .where(and(eq(students.tutorId, tutorId), eq(students.id, id)));
  revalidatePath("/dashboard", "layout");
}

export async function setStudentGender(
  id: string,
  gender: "male" | "female" | null,
): Promise<void> {
  const tutorId = await currentTutorId();
  await db
    .update(students)
    .set({ gender })
    .where(and(eq(students.tutorId, tutorId), eq(students.id, id)));
  revalidatePath("/dashboard", "layout");
}
