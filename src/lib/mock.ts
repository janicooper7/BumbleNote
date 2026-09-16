// Mock data for the dashboard shell.
// This stands in for the real database/API until auth + persistence are wired up.
// The session fields also mirror the shape of the AI feedback output, so the
// review screen renders exactly what the model would produce for a real lesson.

export type SessionStatus = "draft" | "confirmed" | "sent";

/** CEFR levels the tutor observes per lesson. */
export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

// A vocab item now carries an example sentence drawn from the lesson, shown to
// the student after the meaning.
export type VocabItem = { term: string; meaning: string; example: string };

/** Share of speaking time in the lesson, as percentages that sum to 100. */
export type TalkTime = { tutor: number; student: number };

export type Session = {
  id: string;
  studentId: string;
  studentName: string;
  studentInitial: string;
  studentGender?: "male" | "female";
  title: string;
  date: string; // human readable
  isoDate: string; // sortable YYYY-MM-DD
  durationMin: number;
  status: SessionStatus;
  levelFrom: string;
  levelTo: string;
  observedLevel: CEFRLevel; // level observed this lesson
  talkTime: TalkTime;
  vocab: VocabItem[];
  wentWell: string[];
  focus: string[];
  homework: string; // suggested homework for the student
  additionalInfo: string; // any extra note for the student
  nextLesson: string[];
  lessonEndedAt: string; // where in the material the lesson ended
  tutorNotes: string;
};

export type Student = {
  id: string;
  name: string;
  initial: string;
  gender?: "male" | "female"; // unset shows a neutral avatar
  level: string;
  goal: string;
  native: string;
  email?: string; // student's email, for sending lesson-report PDFs
  lessonCount: number;
  vocabCount: number;
  lastSeen: string;
  focus: string[];
  trend: "up" | "steady";
  active?: boolean; // active (default) or archived/inactive; false = inactive
  notes?: string; // free-form private notes the tutor keeps on the student
  // Optional profile fields captured when adding a student.
  targetExam?: string;
  interests?: string[];
  startDate?: string;
};

export const students: Student[] = [
  {
    id: "maria",
    name: "Maria Silva",
    initial: "M",
    level: "B1 → B2",
    goal: "Business English",
    native: "Portuguese",
    lessonCount: 12,
    vocabCount: 148,
    lastSeen: "2 Jul",
    focus: ["Articles", "/θ/ pronunciation"],
    trend: "up",
    active: true,
    notes: "Prefers business scenarios and role-play. Very consistent with homework.",
  },
  {
    id: "kenji",
    name: "Kenji Tanaka",
    initial: "K",
    level: "A2 → B1",
    goal: "Conversational",
    native: "Japanese",
    lessonCount: 8,
    vocabCount: 92,
    lastSeen: "1 Jul",
    focus: ["Plural forms", "Question intonation"],
    trend: "up",
    active: true,
    notes: "Loves phrasal verbs and retains them well. Keep building speaking confidence.",
  },
  {
    id: "sofia",
    name: "Sofia Rossi",
    initial: "S",
    level: "B2 → C1",
    goal: "IELTS (target 7.5)",
    native: "Italian",
    lessonCount: 21,
    vocabCount: 263,
    lastSeen: "30 Jun",
    focus: ["Linking words", "Essay structure"],
    trend: "steady",
    active: true,
    notes: "Exam-focused. Push variety in linking words to unlock the final half-band.",
  },
  {
    id: "ahmed",
    name: "Ahmed Hassan",
    initial: "A",
    level: "A1 → A2",
    goal: "Travel & everyday",
    native: "Arabic",
    lessonCount: 4,
    vocabCount: 41,
    lastSeen: "28 Jun",
    focus: ["Present simple", "Numbers"],
    trend: "up",
    active: false,
    notes: "Paused lessons while travelling. Keep material practical and travel-based.",
  },
];

export const sessions: Session[] = [
  {
    id: "s-maria-12",
    studentId: "maria",
    studentName: "Maria Silva",
    studentInitial: "M",
    title: "Lesson 12 · Negotiating deadlines",
    date: "2 Jul 2026",
    isoDate: "2026-07-02",
    durationMin: 50,
    status: "draft",
    levelFrom: "B1",
    levelTo: "B2",
    observedLevel: "B1",
    talkTime: { tutor: 40, student: 60 },
    vocab: [
      {
        term: "to negotiate",
        meaning: "to reach an agreement through discussion",
        example: "We had to negotiate a new deadline with the client.",
      },
      {
        term: "deadline",
        meaning: "the latest time something must be finished",
        example: "The deadline for the report is next Friday.",
      },
      {
        term: "on second thought",
        meaning: "used when you change your opinion",
        example: "On second thought, let's postpone the meeting until Monday.",
      },
      {
        term: "to postpone",
        meaning: "to move an event to a later time",
        example: "They decided to postpone the product launch until March.",
      },
    ],
    wentWell: ["Confident past-tense narration", "Natural small talk at the open"],
    focus: [
      'Articles before abstract nouns ("the advice" → "advice")',
      '/θ/ sound in "think", "through"',
    ],
    homework:
      "Write a short email (5–6 sentences) postponing a meeting, using \"postpone\" and \"on second thought\".",
    additionalInfo:
      "Lovely energy today. Review the four new phrases out loud before our next lesson.",
    nextLesson: [
      "Role-play: negotiating a project timeline",
      "Minimal-pair drill for /θ/ vs /s/",
      "Introduce B2 reading: a short business email thread",
    ],
    lessonEndedAt:
      "Finished the negotiating role-play; stopped before the B2 business email-thread reading.",
    tutorNotes:
      "Maria is ready to push into B2 material. Articles are the main blocker to sounding natural — worth a focused 10 minutes next time.",
  },
  {
    id: "s-kenji-08",
    studentId: "kenji",
    studentName: "Kenji Tanaka",
    studentInitial: "K",
    title: "Lesson 8 · Weekend plans",
    date: "1 Jul 2026",
    isoDate: "2026-07-01",
    durationMin: 45,
    status: "draft",
    levelFrom: "A2",
    levelTo: "B1",
    observedLevel: "A2",
    talkTime: { tutor: 55, student: 45 },
    vocab: [
      {
        term: "to look forward to",
        meaning: "to feel excited about a future event",
        example: "I look forward to seeing my friends this weekend.",
      },
      {
        term: "get together",
        meaning: "to meet socially",
        example: "Let's get together for coffee on Saturday.",
      },
      {
        term: "run out of",
        meaning: "to have no more of something",
        example: "We ran out of time before the last exercise.",
      },
    ],
    wentWell: ["Used three new phrasal verbs unprompted", "Great question intonation"],
    focus: ["Plural -s endings", "Countable vs uncountable nouns"],
    homework:
      "Write three sentences about your weekend plans using \"look forward to\" and \"get together\".",
    additionalInfo:
      "You used the new phrasal verbs really naturally — keep noticing them when you read.",
    nextLesson: [
      "Countable/uncountable sorting game",
      "Short listening: making weekend plans",
    ],
    lessonEndedAt:
      "Covered all three phrasal verbs; didn't reach the countable/uncountable sorting game.",
    tutorNotes:
      "Kenji's confidence is climbing fast. Keep leaning on phrasal verbs — he enjoys them and retains them well.",
  },
  {
    id: "s-sofia-21",
    studentId: "sofia",
    studentName: "Sofia Rossi",
    studentInitial: "S",
    title: "Lesson 21 · IELTS Writing Task 2",
    date: "30 Jun 2026",
    isoDate: "2026-06-30",
    durationMin: 60,
    status: "sent",
    levelFrom: "B2",
    levelTo: "C1",
    observedLevel: "C1",
    talkTime: { tutor: 50, student: 50 },
    vocab: [
      {
        term: "furthermore",
        meaning: "in addition; used to add a supporting point",
        example: "The plan is expensive; furthermore, it is hard to implement.",
      },
      {
        term: "notwithstanding",
        meaning: "in spite of; despite",
        example: "Notwithstanding the cost, the committee approved the project.",
      },
    ],
    wentWell: ["Clear four-paragraph structure", "Strong topic sentences"],
    focus: ["Overuse of 'moreover'", "Comma splices in long sentences"],
    homework:
      "Write one 40-minute Task 2 essay using at least four different linking words (avoid 'moreover').",
    additionalInfo:
      "You're very close to band 7.5 — variety of linking words is the last step to unlock it.",
    nextLesson: ["Cohesion devices beyond 'moreover'", "Timed 40-minute essay"],
    lessonEndedAt:
      "Reviewed the full essay structure; started but didn't finish the timed practice essay.",
    tutorNotes:
      "Sofia is close to band 7.5 on writing. Variety of linking words is the last 0.5 to unlock.",
  },
];

export function studentById(id: string) {
  return students.find((s) => s.id === id);
}

export function sessionById(id: string) {
  return sessions.find((s) => s.id === id);
}

export function sessionsForStudent(studentId: string) {
  return sessions.filter((s) => s.studentId === studentId);
}

/** Split a "Lesson N · Topic" title into its lesson label and topic parts. */
export function splitLessonTitle(title: string): { label: string; topic: string } {
  const idx = title.indexOf("·");
  if (idx === -1) return { label: "", topic: title.trim() };
  return { label: title.slice(0, idx).trim(), topic: title.slice(idx + 1).trim() };
}

/** Sort key options for a list of sessions. */
export type SessionSort = "date" | "title";

/** Return a new sorted array — by most-recent date first, or title A→Z. */
export function sortSessions(list: Session[], by: SessionSort): Session[] {
  const next = [...list];
  if (by === "title") {
    next.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    next.sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  }
  return next;
}

export const draftSessions = sessions.filter((s) => s.status === "draft");

// Sessions still awaiting the tutor — anything not yet sent to the student.
// Used as the SSR-safe seed for the dashboard queue before localStorage loads.
export const pendingSessions = sessions.filter((s) => s.status !== "sent");
