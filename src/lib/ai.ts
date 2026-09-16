// Claude-backed generation of structured lesson feedback.
//
// Server-only. Given a labelled lesson transcript plus a little context about the
// student, Claude produces the exact feedback shape the review screen already
// renders (vocab with examples, what went well, focus areas, homework, next-lesson
// plan, observed CEFR level, talk-time split, private tutor notes). This is the
// same output an STT step would eventually feed — the transcript is just supplied
// by paste for now, so the signature won't change when speech-to-text lands.

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { CEFR_LEVELS, type CEFRLevel, type TalkTime, type VocabItem } from "./mock";

// Kept as a single swappable constant. Sonnet 5 is used here for speed (roughly
// halves the analysis step vs Opus 4.8, ~5x cheaper) while keeping high quality
// on this structured-feedback task. Switch to "claude-opus-4-8" for maximum
// quality — it takes the same adaptive thinking + effort + json_schema options.
//
// "claude-haiku-4-5" is cheaper still but is NOT a one-line swap: it rejects
// `output_config.effort`, and its only thinking mode is the older fixed budget
// (`type: "enabled"` + `budget_tokens`) rather than `type: "adaptive"`.
const MODEL = "claude-sonnet-5";

// Lazy client so `next build` doesn't require the key at import time (mirrors the
// lazy `db` client in src/db/index.ts).
//
// The SDK defaults (10-min timeout, 2 retries) allow up to 30 minutes of wall
// clock on a stalled stream — longer than the 15-min budget of the background
// worker that calls this. The platform would then kill the process mid-attempt,
// so nothing throws, the worker's catch never runs, and the upload's status blob
// stays "processing" forever. Cap it so a stall raises while the worker is still
// alive: worst case 2 x 300s = 600s, comfortably inside the 15-min budget.
let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: 300_000,
      maxRetries: 1,
    });
  }
  return client;
}

/** Context about the student that sharpens the generated feedback. */
export type LessonContext = {
  studentName: string;
  native: string;
  level: string; // e.g. "B1 → B2"
  goal: string;
  focus: string[]; // known weaknesses / areas being worked on
  interests?: string[];
  /**
   * The student's history as a rendered text block — vocabulary already taught,
   * recurring areas to improve, level trajectory, recent lessons. Built by
   * `journeyPromptBlock` (src/lib/journey.ts) and omitted for a first lesson.
   *
   * This is what separates BumbleNote's feedback from a one-off transcript
   * summary: without it the model re-teaches words the student learned a month
   * ago and reports the same weakness every week as though it were news.
   */
  journey?: string;
};

/** The structured feedback Claude returns for one lesson. */
export type GeneratedFeedback = {
  topic: string; // short lesson topic, e.g. "Negotiating deadlines"
  observedLevel: CEFRLevel;
  talkTime: TalkTime;
  vocab: VocabItem[];
  wentWell: string[];
  focus: string[];
  homework: string;
  additionalInfo: string;
  nextLesson: string[];
  lessonEndedAt: string;
  tutorNotes: string;
};

// JSON schema for structured outputs. Every object needs additionalProperties:false
// and a full `required` list; string/number length + range constraints aren't
// supported, so guidance about counts lives in the prompt instead.
const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topic: { type: "string" },
    observedLevel: { type: "string", enum: CEFR_LEVELS },
    talkTime: {
      type: "object",
      additionalProperties: false,
      properties: {
        tutor: { type: "integer" },
        student: { type: "integer" },
      },
      required: ["tutor", "student"],
    },
    vocab: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          term: { type: "string" },
          meaning: { type: "string" },
          example: { type: "string" },
        },
        required: ["term", "meaning", "example"],
      },
    },
    wentWell: { type: "array", items: { type: "string" } },
    focus: { type: "array", items: { type: "string" } },
    homework: { type: "string" },
    additionalInfo: { type: "string" },
    nextLesson: { type: "array", items: { type: "string" } },
    lessonEndedAt: { type: "string" },
    tutorNotes: { type: "string" },
  },
  required: [
    "topic",
    "observedLevel",
    "talkTime",
    "vocab",
    "wentWell",
    "focus",
    "homework",
    "additionalInfo",
    "nextLesson",
    "lessonEndedAt",
    "tutorNotes",
  ],
} as const;

const SYSTEM_PROMPT = `You are an expert English-language tutor writing structured post-lesson feedback from a transcript of a one-to-one lesson. The transcript labels turns as "Tutor:" and "Student:".

Produce feedback that is warm, specific, and grounded ONLY in what the transcript shows — never invent achievements or vocabulary that didn't come up. Voice — this matters:
- wentWell, focus, homework, additionalInfo and the vocab examples are sent directly to the student. Address the student as "you" throughout: "You kept the conversation going…", "Third-person verbs: 'she have' → 'she has'…". Never refer to them as "the student", "they", or by name in these fields, and never write as though reporting to the tutor.
- Write these as the tutor speaking to the student, in full sentences with "you" as the subject — NOT as report-style fragments with the subject dropped. A line like "Engaged thoughtfully with the article…" or "Showed clear improvement in the 'r' sound…" reads as a report about the student, even though it never says "the student". Write "You engaged thoughtfully with the article…" and "You showed clear improvement in the 'r' sound…" instead. Likewise an area to improve must not be a bare noun phrase like "Confidence in initiating small talk."; write "You're ready to start small talk yourself — the next step is building the confidence to do it…".
- nextLesson, lessonEndedAt and tutorNotes are private to the tutor and may refer to the student in the third person.

Using the learning journey:
When the prompt includes a "Learning journey so far" block, this student has been taught before and you are writing the next entry in a continuing record — not a standalone summary. Use it as follows:
- The journey is context, NEVER evidence. Only the transcript can show what happened in this lesson. If the journey says a weakness is open but the transcript shows no sign of it, say nothing about it rather than repeating it on faith.
- Vocabulary already taught should not be re-introduced as new. If such a term recurs in the transcript, include it only when the student is now using it noticeably better or still getting it wrong — and say which. Otherwise spend the list on genuinely new language.
- Prefer areas to improve that connect to an open theme in the journey, phrased so the student sees the thread ("You're still dropping articles before abstract nouns — this has come up for a few lessons now"). Raise a brand-new weakness only when the transcript shows one that matters more.
- If the transcript shows real improvement in something the journey lists as open or recently resolved, that is the strongest thing you can put in wentWell. Name it explicitly as progress.
- nextLesson should move the student along the trajectory the journey shows, and should not repeat an activity the recent lessons already covered.
- tutorNotes is where the long view belongs: whether the student is genuinely progressing or plateauing across the lessons on record, and the single most useful thing to work on next.

Field guidance:
- topic: a short 2–5 word lesson topic drawn from the main theme (e.g. "Negotiating deadlines").
- observedLevel: the CEFR level (A1–C2) the student actually demonstrated this lesson, based on their output — not their target.
- talkTime: your best estimate of the share of speaking time, as two integers (tutor + student) that sum to 100. In a healthy lesson the student speaks at least half.
- vocab: words or phrases that genuinely came up and are worth reviewing — scale the count to the lesson. A short or slow lesson may only yield 3–5, while a full ~50-minute lesson rich in language typically supports 8–12. Never pad the list with terms that didn't genuinely come up just to reach a number. For each: the term, a short plain-English meaning, and one natural example sentence (prefer the student's own context/interests when it fits).
- wentWell: 2–3 concrete strengths shown in the transcript. Every item starts with "You" (e.g. "You told the story of the baptism in real detail and kept the thread even when interrupted.").
- focus: 2–3 specific areas to improve, spoken to the student in a full sentence that includes "you", phrased constructively; include the correction where useful (e.g. 'You tend to add "the" before abstract nouns where English leaves it out ("the advice" → "advice").').
- homework: one short, concrete task that practises this lesson's language, written as an instruction to the student.
- additionalInfo: a brief encouraging note to the student, in the tutor's voice.
- nextLesson: 2–3 planned activities that build on where this lesson ended.
- lessonEndedAt: one sentence on what was covered and where the lesson stopped.
- tutorNotes: private notes for the tutor — the student's trajectory and the single most useful thing to work on next.`;

/**
 * Generate structured lesson feedback from a transcript. Throws if the key is
 * missing, the model refuses, or the response can't be parsed.
 */
export async function generateLessonFeedback(
  transcript: string,
  context: LessonContext,
): Promise<GeneratedFeedback> {
  const userContent = [
    "Write the post-lesson feedback for this lesson.",
    "",
    "Student context:",
    `- Name: ${context.studentName}`,
    `- Native language: ${context.native}`,
    `- Level (current → target): ${context.level}`,
    `- Goal: ${context.goal}`,
    context.focus.length ? `- Currently working on: ${context.focus.join(", ")}` : "",
    context.interests?.length ? `- Interests: ${context.interests.join(", ")}` : "",
    // History last within the context block, closest to the transcript it should
    // be read against.
    context.journey ? `\nLearning journey so far:\n${context.journey}` : "",
    "",
    "Lesson transcript:",
    transcript.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return runFeedbackPrompt(SYSTEM_PROMPT, userContent, "this transcript");
}

const MERGE_SYSTEM_PROMPT = `You are an expert English-language tutor. A one-to-one lesson was interrupted — the call dropped and was recorded in several parts — and feedback was drafted separately for each part. Combine those drafts into the single feedback report the student would have received had the lesson been recorded in one go.

Rules:
- Work ONLY from the drafts. Never invent achievements, vocabulary or corrections that no part contains.
- The parts are in lesson order. Where the drafts overlap or repeat each other, say it once. Where they conflict, prefer the later part — it reflects where the lesson got to.
- Voice: wentWell, focus, homework, additionalInfo and the vocab examples are sent to the student, so write them as the tutor speaking to the student, in full sentences with "you" as the subject. If a draft uses report-style fragments ("Engaged thoughtfully with…", "Confidence in initiating small talk.") or third person, rewrite them ("You engaged thoughtfully with…"). Every wentWell item starts with "You". nextLesson, lessonEndedAt and tutorNotes are private to the tutor and may use the third person.
- Treat any text the tutor edited into a draft as deliberate — keep its substance.

Field guidance:
- topic: a short 2–5 word topic covering the lesson as a whole.
- observedLevel: the CEFR level the student demonstrated across the whole lesson.
- talkTime: copy any part's values; it is recalculated afterwards.
- vocab: the union of the parts' vocabulary with duplicates merged (keep the better meaning and example). Don't drop genuine terms to shorten the list.
- wentWell: 2–3 strengths, the strongest across all parts.
- focus: 2–3 areas to improve, the most important across all parts, with corrections where the drafts give them.
- homework: one concrete task covering the lesson's language. Combine the parts' tasks only if it stays short.
- additionalInfo: one brief encouraging note.
- nextLesson: 2–3 activities that build on where the LAST part ended.
- lessonEndedAt: one sentence on what the whole lesson covered and where it stopped (the last part).
- tutorNotes: merge the parts' notes into one coherent private note.`;

/** One recorded part of an interrupted lesson, as mergeLessonFeedback reads it. */
export type LessonPart = Omit<GeneratedFeedback, "topic"> & {
  title: string;
  durationMin: number;
};

/**
 * Combine the separately drafted feedback of an interrupted lesson's parts into
 * one report. Works from the drafts, not transcripts — those are discarded once
 * a draft exists (see the privacy page), so the drafts are all that's left.
 */
export async function mergeLessonFeedback(
  parts: LessonPart[],
  context: Pick<LessonContext, "studentName" | "native" | "level" | "goal">,
): Promise<GeneratedFeedback> {
  const userContent = [
    `Combine these ${parts.length} parts of one interrupted lesson into a single feedback report.`,
    "",
    "Student context:",
    `- Name: ${context.studentName}`,
    `- Native language: ${context.native}`,
    `- Level (current → target): ${context.level}`,
    `- Goal: ${context.goal}`,
    "",
    ...parts.map((p, i) =>
      [
        `Part ${i + 1} of ${parts.length} (${p.durationMin} min) — "${p.title}":`,
        JSON.stringify({
          observedLevel: p.observedLevel,
          vocab: p.vocab,
          wentWell: p.wentWell,
          focus: p.focus,
          homework: p.homework,
          additionalInfo: p.additionalInfo,
          nextLesson: p.nextLesson,
          lessonEndedAt: p.lessonEndedAt,
          tutorNotes: p.tutorNotes,
        }),
        "",
      ].join("\n"),
    ),
  ].join("\n");

  return runFeedbackPrompt(MERGE_SYSTEM_PROMPT, userContent, "these lesson parts");
}

async function runFeedbackPrompt(
  system: string,
  userContent: string,
  subject: string,
): Promise<GeneratedFeedback> {
  // Stream rather than a single blocking request. A long lesson (e.g. a 49-min
  // transcript) is a large input with meaningful output + thinking, and a
  // non-streaming call holds one HTTP request open for the whole generation —
  // long enough that the socket gets dropped ("fetch failed") before it returns,
  // especially inside the Netlify background worker. Streaming keeps the
  // connection alive with incremental events; finalMessage() assembles the
  // complete response. Structured outputs + adaptive thinking both work here.
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: FEEDBACK_SCHEMA },
    },
    system,
    messages: [{ role: "user", content: userContent }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error(`The model declined to generate feedback for ${subject}.`);
  }

  // With output_config.format the text block is JSON validated against the schema.
  const parsed = parseTextOutput(response) as GeneratedFeedback | null;

  if (!parsed) {
    throw new Error(
      response.stop_reason === "max_tokens"
        ? "The feedback was cut off before it finished. Try a shorter transcript."
        : "Couldn't read the generated feedback.",
    );
  }
  return parsed;
}

function parseTextOutput(response: Anthropic.Message): unknown {
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
