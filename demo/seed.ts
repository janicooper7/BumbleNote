// Demo account for screen recordings.
//
// Run with:  npm run demo:seed
//
// Creates (or resets) one tutor, DEMO_EMAIL / DEMO_PASSWORD, on an active paid
// plan with terms already accepted. Empty by default; DEMO_SAMPLE=1 fills it
// with realistic students and lessons dated relative to today, so "Lessons this
// week" and "Awaiting you" always look lived-in whenever you record.
// Idempotent: every run wipes the demo tutor's students (lessons and
// attachments cascade) first, so each take starts from the same state.

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { creditGrants, lessonReservations, sessions, students, tutors } from "../src/db/schema";
import { readFileSync } from "node:fs";
import { hashPassword } from "../src/lib/password";

config({ path: ".env.local" });
config();

export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@bumblenote.com";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "BumbleDemo2026!";

// Read rather than imported: src/lib/terms.ts pulls in the app's db client.
// Matching the current version keeps the demo off the /accept-terms page.
const TERMS_VERSION = readFileSync("src/lib/terms.ts", "utf8").match(
  /TERMS_VERSION = "([^"]+)"/,
)![1];

// ── dates ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    iso,
    human: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    short: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
    at: d,
  };
}

// ── students ───────────────────────────────────────────────────────────────

type DemoStudent = {
  key: string;
  name: string;
  level: string;
  goal: string;
  native: string;
  hourlyRate: number;
  focus: string[];
  trend: "up" | "steady";
  active?: boolean;
  notes: string;
  targetExam?: string;
  interests: string[];
  startedDaysAgo: number;
};

const STUDENTS: DemoStudent[] = [
  {
    key: "maria",
    name: "Maria Silva",
    level: "B1 → B2",
    goal: "Business English",
    native: "Portuguese",
    hourlyRate: 30,
    focus: ["Articles", "/θ/ pronunciation"],
    trend: "up",
    notes: "Project manager at a logistics firm in Lisbon. Prefers business role-play. Very consistent with homework.",
    interests: ["cycling", "podcasts", "cooking"],
    startedDaysAgo: 120,
  },
  {
    key: "kenji",
    name: "Kenji Tanaka",
    level: "A2 → B1",
    goal: "Conversational",
    native: "Japanese",
    hourlyRate: 25,
    focus: ["Plural forms", "Question intonation"],
    trend: "up",
    notes: "Loves phrasal verbs and retains them well. Shy at first — warm up with something about football.",
    interests: ["football", "anime", "travel"],
    startedDaysAgo: 75,
  },
  {
    key: "sofia",
    name: "Sofia Rossi",
    level: "B2 → C1",
    goal: "IELTS (target 7.5)",
    native: "Italian",
    hourlyRate: 35,
    focus: ["Linking words", "Essay structure"],
    trend: "steady",
    targetExam: "IELTS 7.5",
    notes: "Exam in November. Push variety in linking words to unlock the final half-band.",
    interests: ["architecture", "film", "running"],
    startedDaysAgo: 160,
  },
  {
    key: "lucas",
    name: "Lucas Müller",
    level: "B2",
    goal: "Job interviews",
    native: "German",
    hourlyRate: 35,
    focus: ["Present perfect vs past simple", "Concise answers"],
    trend: "up",
    notes: "Software engineer interviewing with UK companies. Answers are accurate but long — practise the STAR format.",
    interests: ["tech", "climbing", "board games"],
    startedDaysAgo: 40,
  },
  {
    key: "aylin",
    name: "Aylin Demir",
    level: "B1",
    goal: "University prep",
    native: "Turkish",
    hourlyRate: 28,
    focus: ["Academic vocabulary", "Word stress"],
    trend: "up",
    notes: "Starting a master's in Manchester next year. Enjoys debate-style lessons.",
    interests: ["psychology", "music", "coffee"],
    startedDaysAgo: 30,
  },
  {
    key: "ahmed",
    name: "Ahmed Hassan",
    level: "A1 → A2",
    goal: "Travel & everyday",
    native: "Arabic",
    hourlyRate: 22,
    focus: ["Present simple", "Numbers"],
    trend: "steady",
    active: false,
    notes: "Paused lessons while travelling. Keep material practical and travel-based.",
    interests: ["photography", "travel"],
    startedDaysAgo: 200,
  },
];

// ── lessons ────────────────────────────────────────────────────────────────

type Vocab = { term: string; meaning: string; example: string };

type DemoLesson = {
  student: string;
  n: number;
  topic: string;
  daysAgo: number;
  durationMin: number;
  status: "draft" | "confirmed" | "sent";
  from: string;
  to: string;
  observed: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  talk: [tutor: number, student: number];
  vocab: Vocab[];
  wentWell: string[];
  focus: string[];
  homework: string;
  additionalInfo: string;
  nextLesson: string[];
  endedAt: string;
  tutorNotes: string;
  trial?: boolean;
  /** One recording of a lesson that was split in two, for the combine guide. */
  part?: number;
  /** Created this many minutes ago (parts must sit within 3h of each other). */
  minutesAgo?: number;
};

const LESSONS: DemoLesson[] = [
  // Maria — latest is a fresh draft, the hero of the "review a lesson" take.
  {
    student: "maria", n: 14, topic: "Negotiating deadlines", daysAgo: 0, durationMin: 52, status: "draft",
    from: "B1", to: "B2", observed: "B2", talk: [38, 62],
    vocab: [
      { term: "to push back (a deadline)", meaning: "to move a deadline later", example: "Could we push back the delivery date to Friday?" },
      { term: "leeway", meaning: "extra time or freedom to act", example: "We don't have much leeway on the budget this quarter." },
      { term: "to meet halfway", meaning: "to compromise", example: "If you can meet us halfway on price, we can sign today." },
      { term: "non-negotiable", meaning: "cannot be changed or discussed", example: "The launch date is non-negotiable." },
    ],
    wentWell: [
      // One on purpose: the "review a lesson" take adds the second live.
      "Held her position calmly through the whole negotiation role-play",
    ],
    focus: [
      "Articles with abstract nouns (\"the flexibility\" → \"flexibility\")",
      "Softening language — \"I'm afraid that…\", \"Would it be possible…\"",
    ],
    homework: "Write a short email to a supplier asking to push back a deadline by one week. Use \"leeway\" and \"meet halfway\".",
    additionalInfo: "Great session — you sounded like you'd done this a hundred times. Keep reading the Harvard Business Review article we started.",
    nextLesson: ["Role-play: a supplier refuses the new deadline", "Softening phrases drill", "Finish the HBR article on negotiation"],
    endedAt: "Finished role-play 2; stopped halfway through the HBR article (paragraph 4).",
    tutorNotes: "Ready for B2 material across the board. Articles are the last big blocker.",
  },
  {
    student: "maria", n: 13, topic: "Running a meeting", daysAgo: 7, durationMin: 50, status: "sent",
    from: "B1", to: "B2", observed: "B1", talk: [45, 55],
    vocab: [
      { term: "to kick off", meaning: "to start", example: "Let's kick off with a quick update from each team." },
      { term: "action item", meaning: "a task agreed in a meeting", example: "I'll send round the action items after the call." },
      { term: "to circle back", meaning: "to return to a topic later", example: "Can we circle back to the budget at the end?" },
    ],
    wentWell: ["Chaired the mock meeting with confidence", "Good use of signposting language"],
    focus: ["/θ/ sound in \"think\", \"through\"", "Articles before job titles"],
    homework: "Record a two-minute voice note opening a team meeting.",
    additionalInfo: "Lovely energy today!",
    nextLesson: ["Negotiation language", "/θ/ minimal pairs"],
    endedAt: "Completed the meeting role-play.",
    tutorNotes: "Signposting is solid now.",
  },
  {
    student: "maria", n: 12, topic: "Small talk with clients", daysAgo: 14, durationMin: 50, status: "sent",
    from: "B1", to: "B2", observed: "B1", talk: [50, 50],
    vocab: [
      { term: "to break the ice", meaning: "to make people feel relaxed", example: "He broke the ice by asking about the flight." },
      { term: "to touch base", meaning: "to briefly make contact", example: "Let's touch base next week." },
    ],
    wentWell: ["Natural follow-up questions"],
    focus: ["Question tags", "Articles"],
    homework: "Prepare three small-talk openers for your client visit.",
    additionalInfo: "",
    nextLesson: ["Running a meeting"],
    endedAt: "Finished the client-visit role-play.",
    tutorNotes: "",
  },

  // Kenji — today's lesson dropped halfway, so it came in as two short parts.
  {
    student: "kenji", n: 10, part: 1, minutesAgo: 95, topic: "Travel stories (part 1)", daysAgo: 0, durationMin: 17, status: "draft",
    from: "A2", to: "B1", observed: "A2", talk: [50, 50],
    vocab: [
      { term: "to get lost", meaning: "to not know where you are", example: "We got lost on the way to the hotel." },
      { term: "sightseeing", meaning: "visiting famous places", example: "We went sightseeing in Kyoto." },
    ],
    wentWell: ["Clear past-simple storytelling"],
    focus: ["Irregular past forms (\"buyed\" → \"bought\")"],
    homework: "",
    additionalInfo: "",
    nextLesson: ["Finish the travel story"],
    endedAt: "Call dropped while describing the train journey.",
    tutorNotes: "",
  },
  {
    student: "kenji", n: 10, part: 2, minutesAgo: 70, topic: "Travel stories (part 2)", daysAgo: 0, durationMin: 24, status: "draft",
    from: "A2", to: "B1", observed: "A2", talk: [45, 55],
    vocab: [
      { term: "to miss (a train)", meaning: "to arrive too late to catch it", example: "I missed the last train home." },
      { term: "on the way", meaning: "during the journey", example: "On the way, we stopped for ramen." },
    ],
    wentWell: ["Longer answers with less hesitation"],
    focus: ["Sequencing words: first, then, after that"],
    homework: "Write the full story of your trip in 8–10 sentences.",
    additionalInfo: "",
    nextLesson: ["Sequencing words practice"],
    endedAt: "Finished the travel story.",
    tutorNotes: "",
  },

  // Kenji — draft from yesterday.
  {
    student: "kenji", n: 9, topic: "Weekend plans", daysAgo: 1, durationMin: 45, status: "draft",
    from: "A2", to: "B1", observed: "A2", talk: [52, 48],
    vocab: [
      { term: "to hang out", meaning: "to spend time relaxing with friends", example: "I'm going to hang out with my friends on Saturday." },
      { term: "to sleep in", meaning: "to sleep later than usual", example: "On Sundays I like to sleep in." },
      { term: "to check out", meaning: "to look at something interesting", example: "We should check out the new ramen place." },
    ],
    wentWell: ["Told a long story about the football match with very few pauses", "Used \"going to\" for plans correctly every time"],
    focus: ["Plural -s (\"two friend\" → \"two friends\")", "Rising intonation in yes/no questions"],
    homework: "Write five sentences about your plans for next weekend using three new phrasal verbs.",
    additionalInfo: "Great progress, Kenji — you spoke for almost half the lesson!",
    nextLesson: ["Making suggestions: \"Why don't we…?\"", "Question intonation drill"],
    endedAt: "Finished the plans conversation; didn't get to the listening task.",
    tutorNotes: "Confidence is clearly up. Talk time crossed 45% for the first time.",
  },
  {
    student: "kenji", n: 8, topic: "At the restaurant", daysAgo: 8, durationMin: 45, status: "sent",
    from: "A2", to: "B1", observed: "A2", talk: [60, 40],
    vocab: [
      { term: "to order", meaning: "to ask for food in a restaurant", example: "Are you ready to order?" },
      { term: "the bill", meaning: "the paper showing how much to pay", example: "Could we have the bill, please?" },
    ],
    wentWell: ["Polite requests with \"Could I…\""],
    focus: ["Countable vs uncountable nouns"],
    homework: "Watch a short restaurant scene on YouTube and note five phrases.",
    additionalInfo: "",
    nextLesson: ["Weekend plans"],
    endedAt: "Completed the ordering role-play.",
    tutorNotes: "",
  },

  // Sofia — confirmed, ready to send.
  {
    student: "sofia", n: 23, topic: "IELTS Task 2 — opinion essay", daysAgo: 2, durationMin: 60, status: "confirmed",
    from: "B2", to: "C1", observed: "C1", talk: [35, 65],
    vocab: [
      { term: "notwithstanding", meaning: "in spite of", example: "Notwithstanding the costs, the benefits are clear." },
      { term: "to be contingent on", meaning: "to depend on", example: "Success is contingent on government funding." },
      { term: "a double-edged sword", meaning: "something with both good and bad effects", example: "Social media is a double-edged sword for teenagers." },
    ],
    wentWell: ["Clear thesis in the introduction", "Wide range of linking words — no repeated \"however\""],
    focus: ["Conclusions that restate rather than summarise", "Over-long sentences in body paragraph 2"],
    homework: "Write a full Task 2 essay (40 minutes, timed): \"Remote work does more harm than good. Do you agree?\"",
    additionalInfo: "This essay would score a 7 today. The conclusion is where the extra half-band is hiding.",
    nextLesson: ["Mark the timed essay together", "Conclusion rewrite workshop"],
    endedAt: "Finished feedback on paragraph 3; conclusion rewrite still to do.",
    tutorNotes: "On track for 7.5 by November.",
  },
  {
    student: "sofia", n: 22, topic: "IELTS Speaking Part 3", daysAgo: 6, durationMin: 60, status: "sent",
    from: "B2", to: "C1", observed: "B2", talk: [30, 70],
    vocab: [
      { term: "by and large", meaning: "generally", example: "By and large, people prefer living in cities." },
      { term: "to weigh up", meaning: "to consider carefully", example: "You have to weigh up the pros and cons." },
    ],
    wentWell: ["Extended answers with examples"],
    focus: ["Hedging language"],
    homework: "Record answers to three Part 3 questions.",
    additionalInfo: "",
    nextLesson: ["Task 2 opinion essay"],
    endedAt: "Completed a full Part 3 mock.",
    tutorNotes: "",
  },
  {
    student: "sofia", n: 21, topic: "Describing graphs (Task 1)", daysAgo: 13, durationMin: 60, status: "sent",
    from: "B2", to: "C1", observed: "B2", talk: [40, 60],
    vocab: [
      { term: "to plateau", meaning: "to stay at the same level after rising", example: "Sales plateaued in the final quarter." },
      { term: "a steep decline", meaning: "a fast fall", example: "There was a steep decline in visitors." },
    ],
    wentWell: ["Accurate data description"],
    focus: ["Overview paragraph"],
    homework: "Write a Task 1 report on the line graph from page 42.",
    additionalInfo: "",
    nextLesson: ["Speaking Part 3"],
    endedAt: "Finished the line-graph report.",
    tutorNotes: "",
  },

  // Lucas.
  {
    student: "lucas", n: 6, topic: "Tell me about yourself", daysAgo: 3, durationMin: 50, status: "sent",
    from: "B2", to: "B2", observed: "B2", talk: [35, 65],
    vocab: [
      { term: "to spearhead", meaning: "to lead a project", example: "I spearheaded the migration to the new platform." },
      { term: "hands-on", meaning: "practical, involving doing things yourself", example: "I have hands-on experience with cloud infrastructure." },
      { term: "a track record", meaning: "past achievements that show ability", example: "She has a strong track record in delivery." },
    ],
    wentWell: ["Strong, specific examples from real projects", "Very few grammar slips under pressure"],
    focus: ["Keep answers under two minutes", "Present perfect for experience (\"I have led…\")"],
    homework: "Prepare a 90-second \"tell me about yourself\" and record it.",
    additionalInfo: "You're interview-ready on content — now it's about trimming.",
    nextLesson: ["STAR answers: a conflict at work", "Mock interview, 20 minutes"],
    endedAt: "Finished three practice answers.",
    tutorNotes: "Interview with a London fintech in two weeks.",
  },
  {
    student: "lucas", n: 5, topic: "Talking about weaknesses", daysAgo: 10, durationMin: 50, status: "sent",
    from: "B2", to: "B2", observed: "B2", talk: [40, 60],
    vocab: [{ term: "to be mindful of", meaning: "to pay attention to", example: "I'm mindful of over-engineering." }],
    wentWell: ["Honest, well-framed answer"],
    focus: ["Concise answers"],
    homework: "Rewrite your weakness answer in 80 words.",
    additionalInfo: "",
    nextLesson: ["Tell me about yourself"],
    endedAt: "Completed the weakness question.",
    tutorNotes: "",
  },

  // Aylin.
  {
    student: "aylin", n: 4, topic: "Debate: social media and teenagers", daysAgo: 4, durationMin: 55, status: "sent",
    from: "B1", to: "B2", observed: "B1", talk: [42, 58],
    vocab: [
      { term: "to argue that", meaning: "to give reasons for an opinion", example: "Some researchers argue that screen time affects sleep." },
      { term: "evidence suggests", meaning: "research shows", example: "Evidence suggests a link between social media and anxiety." },
      { term: "on the other hand", meaning: "used to give the opposite view", example: "On the other hand, it helps teenagers stay connected." },
    ],
    wentWell: ["Structured her argument with clear points", "Used academic phrases from last week"],
    focus: ["Word stress on longer words (\"psyCHOLogy\", \"reSEARCH\")", "Past simple irregular verbs"],
    homework: "Read the article on teenage sleep and write a 150-word summary.",
    additionalInfo: "Loved your closing argument!",
    nextLesson: ["Summarising academic texts", "Word stress practice"],
    endedAt: "Finished the debate; summary task set as homework.",
    tutorNotes: "",
  },
  {
    student: "aylin", n: 1, topic: "Trial lesson", daysAgo: 30, durationMin: 40, status: "sent", trial: true,
    from: "B1", to: "B2", observed: "B1", talk: [55, 45],
    vocab: [{ term: "master's degree", meaning: "a postgraduate degree", example: "I'm starting a master's degree next year." }],
    wentWell: ["Clear about her goals"],
    focus: ["Academic vocabulary"],
    homework: "",
    additionalInfo: "Lovely to meet you, Aylin!",
    nextLesson: ["Academic vocabulary basics"],
    endedAt: "Introductory chat and level check.",
    tutorNotes: "Solid B1, aiming for B2 before the course starts.",
  },

  // Ahmed — inactive, one old lesson.
  {
    student: "ahmed", n: 4, topic: "At the airport", daysAgo: 45, durationMin: 45, status: "sent",
    from: "A1", to: "A2", observed: "A1", talk: [60, 40],
    vocab: [{ term: "boarding pass", meaning: "the card you need to get on a plane", example: "Can I see your boarding pass, please?" }],
    wentWell: ["Remembered all numbers 1–100"],
    focus: ["Present simple questions"],
    homework: "Practise the check-in dialogue.",
    additionalInfo: "Have a great trip!",
    nextLesson: ["At the hotel"],
    endedAt: "Finished the check-in dialogue.",
    tutorNotes: "",
  },
];

// ── main ───────────────────────────────────────────────────────────────────

export async function seedDemo() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (.env.local).");
  const db = drizzle(neon(url));

  const email = DEMO_EMAIL.toLowerCase();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const account = {
    name: "Alex Morgan",
    firstName: "Alex",
    lastName: "Morgan",
    passwordHash,
    // Advanced, the middle tier, so the plan screen offers both an upgrade and a downgrade.
    plan: "advanced" as const,
    subscriptionStatus: "active",
    billingInterval: "month" as const,
    // A live-looking billing month, so Settings shows a renewal date and the
    // pause option. No Stripe ids: nothing on the plan screen can charge.
    billingAnchor: new Date(Date.now() - 12 * 86_400_000),
    currentPeriodEnd: new Date(Date.now() + 18 * 86_400_000),
    cancelAtPeriodEnd: false,
    pausedAt: null,
    pauseResumesAt: null,
    pendingPlan: null,
    pendingPlanAt: null,
    termsAcceptedAt: new Date(),
    termsVersion: TERMS_VERSION,
  };

  let [tutor] = await db.select({ id: tutors.id }).from(tutors).where(eq(tutors.email, email)).limit(1);
  if (tutor) {
    await db.update(tutors).set(account).where(eq(tutors.id, tutor.id));
  } else {
    [tutor] = await db.insert(tutors).values({ email, ...account }).returning({ id: tutors.id });
  }
  const tutorId = tutor.id;

  // Reset: students cascade to lessons and their attachments.
  await db.delete(students).where(eq(students.tutorId, tutorId));
  await db.delete(lessonReservations).where(eq(lessonReservations.tutorId, tutorId));
  await db.delete(creditGrants).where(eq(creditGrants.tutorId, tutorId));

  // Fresh by default: an empty account, so a take can show setting up from
  // scratch. DEMO_SAMPLE=1 fills it with the sample students and lessons below.
  if (process.env.DEMO_SAMPLE !== "1") {
    return { email, password: DEMO_PASSWORD, students: 0, lessons: 0 };
  }

  // Student and lesson ids are global primary keys, so namespace them.
  const sid = (key: string) => `demo-${key}`;
  const byKey = new Map(STUDENTS.map((s) => [s.key, s]));

  await db.insert(students).values(
    STUDENTS.map((s) => {
      const mine = LESSONS.filter((l) => l.student === s.key);
      const last = Math.min(...mine.map((l) => l.daysAgo));
      return {
        id: sid(s.key),
        tutorId,
        name: s.name,
        initial: s.name[0],
        level: s.level,
        goal: s.goal,
        native: s.native,
        // example.com is reserved: a sent report can never reach a real person.
        email: `${s.name.normalize("NFD").replace(/[^A-Za-z ]/g, "").toLowerCase().replace(" ", ".")}@example.com`,
        hourlyRate: s.hourlyRate,
        lessonCount: Math.max(...mine.map((l) => l.n)),
        vocabCount: mine.reduce((n, l) => n + l.vocab.length, 0) + Math.max(...mine.map((l) => l.n)) * 9,
        lastSeen: daysAgo(last).short,
        focus: s.focus,
        trend: s.trend,
        active: s.active ?? true,
        notes: s.notes,
        targetExam: s.targetExam ?? null,
        interests: s.interests,
        startDate: daysAgo(s.startedDaysAgo).human,
      };
    }),
  );

  await db.insert(sessions).values(
    LESSONS.map((l) => {
      const s = byKey.get(l.student)!;
      const day = daysAgo(l.daysAgo);
      // Stagger createdAt through the day so same-day ordering is stable.
      const createdAt = new Date(day.at);
      createdAt.setHours(10 + (l.n % 8), 0, 0, 0);
      if (l.minutesAgo !== undefined) createdAt.setTime(Date.now() - l.minutesAgo * 60_000);
      return {
        id: `demo-${l.student}-${l.n}${l.part ? `-p${l.part}` : ""}`,
        tutorId,
        studentId: sid(l.student),
        studentName: s.name,
        studentInitial: s.name[0],
        title: `Lesson ${l.n} · ${l.topic}`,
        date: day.human,
        isoDate: day.iso,
        durationMin: l.durationMin,
        status: l.status,
        levelFrom: l.from,
        levelTo: l.to,
        observedLevel: l.observed,
        talkTime: { tutor: l.talk[0], student: l.talk[1] },
        vocab: l.vocab,
        wentWell: l.wentWell,
        focus: l.focus,
        homework: l.homework,
        additionalInfo: l.additionalInfo,
        nextLesson: l.nextLesson,
        lessonEndedAt: l.endedAt,
        tutorNotes: l.tutorNotes,
        isTrial: l.trial ?? false,
        createdAt,
      };
    }),
  );

  return { email, password: DEMO_PASSWORD, students: STUDENTS.length, lessons: LESSONS.length };
}

// Run directly (npm run demo:seed), not when imported by the Playwright setup.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("demo/seed.ts")) {
  seedDemo()
    .then((r) => {
      console.log(`Demo account ready: ${r.email} / ${r.password}`);
      console.log(`${r.students} students, ${r.lessons} lessons.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
