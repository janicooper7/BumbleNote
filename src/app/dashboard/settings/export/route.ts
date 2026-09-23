// GET /dashboard/settings/export — everything BumbleNote holds for the signed-in
// tutor, as one JSON download.
//
// This is what makes two promises true: the right to data portability in the
// privacy policy, and the "export anything you want to keep first" line in the
// Terms' account-deletion clause. It's also how a tutor answers a student's
// access request, since the tutor is the controller for student data.
//
// Deliberately left out: credentials (password hash, capture token) and the raw
// bytes of report attachments, which are short-lived copies of files the tutor
// uploaded themselves — their names and sizes are listed instead.

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { sessionAttachments, sessions, students, tutors } from "@/db/schema";

export async function GET(): Promise<Response> {
  const session = await auth();
  const tutorId = session?.user?.tutorId;
  if (!tutorId) return new Response("Not signed in", { status: 401 });

  const [tutor] = await db.select().from(tutors).where(eq(tutors.id, tutorId)).limit(1);
  if (!tutor) return new Response("Account not found", { status: 404 });

  const [studentRows, sessionRows, attachmentRows] = await Promise.all([
    db.select().from(students).where(eq(students.tutorId, tutorId)),
    db.select().from(sessions).where(eq(sessions.tutorId, tutorId)),
    db
      .select({
        id: sessionAttachments.id,
        sessionId: sessionAttachments.sessionId,
        filename: sessionAttachments.filename,
        contentType: sessionAttachments.contentType,
        size: sessionAttachments.size,
        createdAt: sessionAttachments.createdAt,
      })
      .from(sessionAttachments)
      .where(eq(sessionAttachments.tutorId, tutorId)),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, captureToken, ...account } = tutor;

  const body = {
    exportedAt: new Date().toISOString(),
    format: "bumblenote-export/1",
    account,
    students: studentRows,
    lessons: sessionRows,
    attachments: attachmentRows,
  };

  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bumblenote-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
