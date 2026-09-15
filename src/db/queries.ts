// Read queries for the dashboard. Server-only — import these from Server
// Components (and Server Actions), never from a client component.
//
// Every query is scoped to the current tutor. Rows are mapped back to the app's
// types from src/lib/mock.ts (null → undefined for optional fields) so callers
// keep using the same Student/Session shapes the UI already expects.

import { and, count, desc, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "./index";
import {
  sessionAttachments,
  sessions,
  students,
  tutors,
  type DbSession,
  type DbStudent,
} from "./schema";
import { currentTutorId } from "@/auth";
import type { AttachmentMeta } from "@/lib/attachments";
import { MERGE_WINDOW_HOURS, type MergeCandidate } from "@/lib/merge";
import type { Session, Student } from "@/lib/mock";

function toStudent(r: DbStudent): Student {
  return {
    id: r.id,
    name: r.name,
    initial: r.initial,
    level: r.level,
    goal: r.goal,
    native: r.native,
    email: r.email ?? undefined,
    lessonCount: r.lessonCount,
    vocabCount: r.vocabCount,
    lastSeen: r.lastSeen,
    focus: r.focus,
    trend: r.trend,
    active: r.active,
    notes: r.notes,
    targetExam: r.targetExam ?? undefined,
    interests: r.interests ?? undefined,
    startDate: r.startDate ?? undefined,
  };
}

/**
 * Overlay a student's live stats, derived from their lessons, on top of the
 * stored profile row. Only "taught" lessons (confirmed or sent) count — a draft
 * is still in review. Deriving on read keeps the roster, vocab bank, and
 * "areas to improve" correct without denormalized columns drifting out of sync.
 */
function withDerivedStats(base: Student, studentSessions: DbSession[]): Student {
  const taught = studentSessions
    .filter((s) => s.status === "confirmed" || s.status === "sent")
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate));

  const vocab = new Set<string>();
  for (const s of taught) {
    for (const v of s.vocab) {
      const term = v.term?.trim();
      if (term) vocab.add(term.toLowerCase());
    }
  }

  const latest = taught[0];
  return {
    ...base,
    lessonCount: taught.length,
    vocabCount: vocab.size,
    // Fall back to the stored values before any lesson has been taught, so a
    // brand-new student keeps their "New" marker and profile focus areas.
    lastSeen: latest ? latest.date : base.lastSeen,
    focus: latest ? latest.focus : base.focus,
  };
}

function toSession(r: DbSession): Session {
  return {
    id: r.id,
    studentId: r.studentId,
    studentName: r.studentName,
    studentInitial: r.studentInitial,
    title: r.title,
    date: r.date,
    isoDate: r.isoDate,
    durationMin: r.durationMin,
    status: r.status,
    levelFrom: r.levelFrom,
    levelTo: r.levelTo,
    observedLevel: r.observedLevel,
    talkTime: r.talkTime,
    vocab: r.vocab,
    wentWell: r.wentWell,
    focus: r.focus,
    homework: r.homework,
    additionalInfo: r.additionalInfo,
    nextLesson: r.nextLesson,
    lessonEndedAt: r.lessonEndedAt,
    tutorNotes: r.tutorNotes,
  };
}

export async function getStudents(): Promise<Student[]> {
  const tutorId = await currentTutorId();
  const [studentRows, sessionRows] = await Promise.all([
    db.select().from(students).where(eq(students.tutorId, tutorId)).orderBy(students.createdAt),
    db.select().from(sessions).where(eq(sessions.tutorId, tutorId)),
  ]);

  const byStudent = new Map<string, DbSession[]>();
  for (const s of sessionRows) {
    const list = byStudent.get(s.studentId);
    if (list) list.push(s);
    else byStudent.set(s.studentId, [s]);
  }

  return studentRows.map((r) => withDerivedStats(toStudent(r), byStudent.get(r.id) ?? []));
}

export async function getStudentById(id: string): Promise<Student | undefined> {
  return getStudentByIdForTutor(await currentTutorId(), id);
}

/**
 * Same lookup, but for a tutor named explicitly rather than taken from the
 * session. Only for code that legitimately acts on another tenant's behalf —
 * the operator recovery route (/api/admin/recover), which resolves a failed
 * job's student for display. Everything request-scoped must use
 * getStudentById() so the tenant can't be spoofed by a caller-supplied id.
 */
export async function getStudentByIdForTutor(
  tutorId: string,
  id: string,
): Promise<Student | undefined> {
  const [row] = await db
    .select()
    .from(students)
    .where(and(eq(students.tutorId, tutorId), eq(students.id, id)))
    .limit(1);
  if (!row) return undefined;

  const studentSessions = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.studentId, id)));
  return withDerivedStats(toStudent(row), studentSessions);
}

export async function getSessions(): Promise<Session[]> {
  const tutorId = await currentTutorId();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tutorId, tutorId))
    .orderBy(desc(sessions.isoDate));
  return rows.map(toSession);
}

export async function getPendingSessions(): Promise<Session[]> {
  const all = await getSessions();
  return all.filter((s) => s.status !== "sent");
}

export async function getSessionsForStudent(studentId: string): Promise<Session[]> {
  const tutorId = await currentTutorId();
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.studentId, studentId)))
    .orderBy(desc(sessions.isoDate));
  return rows.map(toSession);
}

export type TutorProfile = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  termsVersion: string | null;
};

/**
 * The signed-in tutor's own row. The DB — not the JWT — is the source of truth
 * for the display name: the token still carries whatever Google supplied at
 * sign-in, so anything reading `session.user.name` would keep showing the old
 * name after an edit here until the token is reissued.
 */
export async function getTutor(): Promise<TutorProfile | undefined> {
  const tutorId = await currentTutorId();
  const [row] = await db
    .select({
      id: tutors.id,
      name: tutors.name,
      email: tutors.email,
      createdAt: tutors.createdAt,
      stripeCustomerId: tutors.stripeCustomerId,
      subscriptionStatus: tutors.subscriptionStatus,
      billingInterval: tutors.billingInterval,
      currentPeriodEnd: tutors.currentPeriodEnd,
      cancelAtPeriodEnd: tutors.cancelAtPeriodEnd,
      termsVersion: tutors.termsVersion,
    })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  return row;
}

/**
 * Lifetime lesson count for the current tutor — all statuses, not the monthly
 * quota window (that's lessonUsage() in src/lib/quota.ts). Used to tell the
 * tutor exactly what deleting their account would take with it.
 */
export async function getLessonTotal(): Promise<number> {
  const tutorId = await currentTutorId();
  const [row] = await db
    .select({ n: count() })
    .from(sessions)
    .where(eq(sessions.tutorId, tutorId));
  return row?.n ?? 0;
}

export async function getSessionById(id: string): Promise<Session | undefined> {
  const tutorId = await currentTutorId();
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, id)))
    .limit(1);
  return row ? toSession(row) : undefined;
}

/**
 * Recordings that could be combined with this lesson: the same student's unsent
 * lessons from within MERGE_WINDOW_HOURS of it — this one included — oldest
 * first. Empty when there's nothing to combine it with, or it's been sent.
 * mergeSessions re-checks all of this server-side.
 */
export async function getMergeCandidates(sessionId: string): Promise<MergeCandidate[]> {
  const tutorId = await currentTutorId();
  const [self] = await db
    .select({ studentId: sessions.studentId, status: sessions.status, createdAt: sessions.createdAt })
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!self || self.status === "sent") return [];

  const windowMs = MERGE_WINDOW_HOURS * 3_600_000;
  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      durationMin: sessions.durationMin,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.tutorId, tutorId),
        eq(sessions.studentId, self.studentId),
        ne(sessions.status, "sent"),
        gte(sessions.createdAt, new Date(self.createdAt.getTime() - windowMs)),
        lte(sessions.createdAt, new Date(self.createdAt.getTime() + windowMs)),
      ),
    )
    .orderBy(sessions.createdAt);
  if (rows.length < 2) return [];
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Names and sizes of the files attached to a lesson — no file contents. */
export async function getSessionAttachments(sessionId: string): Promise<AttachmentMeta[]> {
  const tutorId = await currentTutorId();
  return db
    .select({
      id: sessionAttachments.id,
      filename: sessionAttachments.filename,
      size: sessionAttachments.size,
    })
    .from(sessionAttachments)
    .where(
      and(eq(sessionAttachments.tutorId, tutorId), eq(sessionAttachments.sessionId, sessionId)),
    )
    .orderBy(sessionAttachments.createdAt);
}
