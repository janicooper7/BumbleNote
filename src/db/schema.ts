// Database schema (Drizzle / Postgres).
//
// Mirrors the shapes in src/lib/mock.ts so the existing UI types line up with
// what the database returns. Everything is tenant-scoped via `tutor_id`; queries
// must always filter by the current tutor (see src/db/queries.ts).
//
// Note: student/session ids are kept as human slugs (e.g. "maria", "s-maria-12")
// to match the current routes and seed data. When real multi-tenancy lands we can
// migrate to composite (tutor_id, id) keys or uuids; for now slugs stay globally
// unique, which the add-student flow already guarantees.

import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { TalkTime, VocabItem } from "../lib/mock";
import { PLAN_IDS } from "../lib/plans";

export const sessionStatus = pgEnum("session_status", ["draft", "confirmed", "sent"]);
export const tutorPlan = pgEnum("tutor_plan", PLAN_IDS);
export const cefrLevel = pgEnum("cefr_level", ["A1", "A2", "B1", "B2", "C1", "C2"]);
export const studentTrend = pgEnum("student_trend", ["up", "steady"]);

export const tutors = pgTable("tutors", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  // Display name — always populated. For email/password signups it's
  // "<firstName> <lastName>"; for Google it's whatever the profile carries.
  name: text("name").notNull(),
  // Only the email/password flow collects these separately; Google accounts and
  // rows that predate the column leave them null and rely on `name`.
  firstName: text("first_name"),
  lastName: text("last_name"),
  // Null for Google-only accounts. Format is owned by src/lib/password.ts.
  passwordHash: text("password_hash"),
  // Subscription tier. Governs the monthly lesson quota and student cap enforced
  // in src/lib/quota.ts. New tutors start on `free`; Stripe will own this column
  // once billing lands. Tutors that predate the column were grandfathered to
  // `unlimited` by the migration that added it, since renamed to `legacy`.
  plan: tutorPlan("plan").notNull().default("free"),
  // Stripe billing (src/lib/billing.ts). `plan` above stays the one column quota
  // reads; these mirror the subscription that set it, and are written only by
  // syncSubscription() so the webhook and the checkout return can't disagree.
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  // Stripe's own status string (active, past_due, canceled, …). Null = never subscribed.
  subscriptionStatus: text("subscription_status"),
  billingInterval: text("billing_interval").$type<"month" | "year">(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // Lessons ever processed for this tutor. Only goes up — unlike counting
  // `sessions` rows, deleting a lesson doesn't lower it, so the free plan's
  // one-lesson trial can't be reset by deleting the trial lesson.
  lessonsCreated: integer("lessons_created").notNull().default(0),
  // When the tutor accepted the Terms, and which version (src/lib/terms.ts).
  // A version other than the current one sends them to /accept-terms.
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion: text("terms_version"),
  // Bearer token the capture browser extension uses to upload lessons.
  captureToken: text("capture_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const students = pgTable("students", {
  id: text("id").primaryKey(),
  tutorId: uuid("tutor_id")
    .notNull()
    .references(() => tutors.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  initial: text("initial").notNull(),
  level: text("level").notNull(),
  goal: text("goal").notNull(),
  native: text("native").notNull(),
  email: text("email"), // student's email, for sending lesson-report PDFs
  lessonCount: integer("lesson_count").notNull().default(0),
  vocabCount: integer("vocab_count").notNull().default(0),
  lastSeen: text("last_seen").notNull(),
  focus: jsonb("focus").$type<string[]>().notNull().default([]),
  trend: studentTrend("trend").notNull().default("steady"),
  active: boolean("active").notNull().default(true),
  notes: text("notes").notNull().default(""),
  targetExam: text("target_exam"),
  interests: jsonb("interests").$type<string[]>(),
  startDate: text("start_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  tutorId: uuid("tutor_id")
    .notNull()
    .references(() => tutors.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  studentInitial: text("student_initial").notNull(),
  title: text("title").notNull(),
  date: text("date").notNull(), // human readable, e.g. "2 Jul 2026"
  isoDate: date("iso_date", { mode: "string" }).notNull(), // sortable YYYY-MM-DD
  durationMin: integer("duration_min").notNull(),
  status: sessionStatus("status").notNull().default("draft"),
  levelFrom: text("level_from").notNull(),
  levelTo: text("level_to").notNull(),
  observedLevel: cefrLevel("observed_level").notNull(),
  talkTime: jsonb("talk_time").$type<TalkTime>().notNull(),
  vocab: jsonb("vocab").$type<VocabItem[]>().notNull().default([]),
  wentWell: jsonb("went_well").$type<string[]>().notNull().default([]),
  focus: jsonb("focus").$type<string[]>().notNull().default([]),
  homework: text("homework").notNull().default(""),
  additionalInfo: text("additional_info").notNull().default(""),
  nextLesson: jsonb("next_lesson").$type<string[]>().notNull().default([]),
  lessonEndedAt: text("lesson_ended_at").notNull().default(""),
  tutorNotes: text("tutor_notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Single-use tokens backing the "forgot password" flow (src/lib/reset-tokens.ts).
 *
 * Only the SHA-256 of the token is stored, so a leaked database dump can't be
 * turned back into working reset links. Rows are kept after use rather than
 * deleted — `usedAt` is what makes a second click on the same emailed link fail
 * closed instead of silently minting a fresh session.
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  tutorId: uuid("tutor_id")
    .notNull()
    .references(() => tutors.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tutorsRelations = relations(tutors, ({ many }) => ({
  students: many(students),
  sessions: many(sessions),
  passwordResetTokens: many(passwordResetTokens),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  tutor: one(tutors, { fields: [passwordResetTokens.tutorId], references: [tutors.id] }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  tutor: one(tutors, { fields: [students.tutorId], references: [tutors.id] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  tutor: one(tutors, { fields: [sessions.tutorId], references: [tutors.id] }),
  student: one(students, { fields: [sessions.studentId], references: [students.id] }),
}));

export type DbTutor = typeof tutors.$inferSelect;
export type DbStudent = typeof students.$inferSelect;
export type NewDbStudent = typeof students.$inferInsert;
export type DbSession = typeof sessions.$inferSelect;
export type NewDbSession = typeof sessions.$inferInsert;
