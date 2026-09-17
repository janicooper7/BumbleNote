// Shared option lists for the add/edit student forms.

export const LEVELS = ["Not sure yet", "A1", "A2", "B1", "B2", "C1", "C2"];

export const GOALS = [
  "Conversational",
  "Business English",
  "Exam preparation",
  "Travel & everyday",
  "Academic",
];

/**
 * Lessons needed before a student's level counts as determined rather than the
 * tutor's starting guess. Below this, every place the level is shown should
 * read as pending — one AI-observed lesson isn't enough to call a CEFR level.
 */
export const LEVEL_DETERMINATION_LESSONS = 4;

/** Whether enough lessons have been taught to treat the level as settled. */
export function isLevelDetermined(lessonCount: number): boolean {
  return lessonCount >= LEVEL_DETERMINATION_LESSONS;
}
