// Combining the parts of an interrupted lesson — when the call drops and the
// tutor ends up with two or three recordings of what was really one lesson.
//
// Client-safe: the review screen uses these to offer the right recordings and
// preview the credit, and the server action (src/app/actions/merge.ts) enforces
// the same rules.

import type { TalkTime } from "./mock";

/**
 * Parts must all have been recorded within this many hours of each other.
 *
 * This is a billing guard as much as a UX filter: combining uses one credit for
 * the whole thing, so without a window two full lessons from different days
 * could be merged to get one of them free.
 */
export const MERGE_WINDOW_HOURS = 3;

/** More parts than this isn't a dropped call, and it bloats the merge prompt. */
export const MAX_MERGE_PARTS = 4;

/** A recording that could be combined with the one being reviewed (or that one itself). */
export type MergeCandidate = {
  id: string;
  title: string;
  durationMin: number;
  /** ISO timestamp the draft was created — the recordings' order. */
  createdAt: string;
};

/** Talk time across the parts, weighted by how long each part ran. */
export function weightedTalkTime(parts: { durationMin: number; talkTime: TalkTime }[]): TalkTime {
  const total = parts.reduce((n, p) => n + p.durationMin, 0);
  if (total <= 0) return parts[0]?.talkTime ?? { tutor: 50, student: 50 };
  const student = Math.round(
    parts.reduce((n, p) => n + p.talkTime.student * p.durationMin, 0) / total,
  );
  return { student, tutor: 100 - student };
}

/** "Lesson 4 · Travel plans" → "Lesson 4", so the combined lesson keeps its number. */
export function lessonNumberPrefix(title: string): string {
  return title.match(/^Lesson \d+/)?.[0] ?? "Lesson";
}
