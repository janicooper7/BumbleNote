// Per-student learning journey — the cumulative picture across every lesson.
//
// Everything here is DERIVED from the student's existing `sessions` rows. There is
// deliberately no journey table: each session already stores the vocab, focus areas
// and observed level for that lesson, so the journey is a fold over those rows
// rather than a second copy that could drift out of sync. A student has tens of
// sessions, not thousands, so folding on demand is cheap and always current — edit
// a lesson's focus areas in the review screen and the journey reflects it on the
// next render, with nothing to backfill and no migration to run.
//
// Pure, and imports types only, so one implementation serves all three callers:
// the student page (a client component), the lesson pipeline (server), and the
// standalone Netlify worker, which cannot import from `next/*`.

import type { CEFRLevel, Session, VocabItem } from "./mock";
import { CEFR_LEVELS } from "./mock";

/**
 * The session fields the journey actually reads. Narrower than `Session` on
 * purpose: a raw `DbSession` row satisfies it too, so the lesson pipeline can
 * fold database rows straight into a journey without mapping them through
 * `toSession` first (that mapper lives in src/db/queries.ts, which imports
 * `@/auth` and so can't be reached from the Netlify worker).
 */
export type JourneySession = Pick<
  Session,
  "status" | "isoDate" | "observedLevel" | "vocab" | "focus" | "title" | "lessonEndedAt"
>;

/** A word or phrase taught to this student, folded across every lesson it appeared in. */
export type JourneyVocab = {
  term: string;
  /** Meaning and example from the most recent lesson that used it. */
  meaning: string;
  example: string;
  /** ISO date of the lesson that introduced it. */
  firstSeen: string;
  lastSeen: string;
  /** Number of lessons it has appeared in. >1 means it keeps coming back. */
  lessons: number;
};

/**
 * A recurring area to improve. The tutor (and Claude) phrase the same underlying
 * problem differently from lesson to lesson — "Articles before abstract nouns"
 * one week, "Article use with uncountables" the next — so raw strings are
 * clustered (see `cluster`) and counted as one theme.
 */
export type JourneyFocus = {
  /** The most recent phrasing, which is the one shown in the UI. */
  label: string;
  /** Every phrasing folded into this theme, newest first. Includes `label`. */
  phrasings: string[];
  /** Number of lessons this theme appeared in. */
  lessons: number;
  firstSeen: string;
  lastSeen: string;
};

export type LevelPoint = { isoDate: string; level: CEFRLevel };

/**
 * Where the student is heading, judged on observed level across lessons:
 * `early` until there is enough history to say anything honest.
 */
export type Trajectory = "early" | "rising" | "holding" | "dipping";

export type Journey = {
  lessonsTaught: number;
  firstLesson?: string;
  lastLesson?: string;
  /** Recurring terms first, then most recently taught. */
  vocab: JourneyVocab[];
  /** Total distinct terms taught — what the "vocabulary bank" number means. */
  vocabCount: number;
  /**
   * Themes still open: seen in the most recent `ACTIVE_WINDOW` lessons. Sorted by
   * how many lessons they span, so the most stubborn problem leads.
   */
  activeFocus: JourneyFocus[];
  /**
   * Themes that have stopped appearing — worked on, then dropped out. Evidence of
   * progress, and the nearest thing to "what we fixed".
   */
  resolvedFocus: JourneyFocus[];
  levels: LevelPoint[];
  levelFirst?: CEFRLevel;
  levelLatest?: CEFRLevel;
  trajectory: Trajectory;
  /** Most recent lessons, newest first, for continuity prompts. */
  recent: { title: string; isoDate: string; endedAt: string }[];
};

/**
 * How many recent lessons a theme must appear within to count as still active.
 * Three is deliberate: a weakness absent for three straight lessons has plausibly
 * been addressed, while two could just be two lessons that went elsewhere.
 */
const ACTIVE_WINDOW = 3;

/** How many recent lessons `recent` carries. Enough for continuity, not a transcript. */
const RECENT_LESSONS = 3;

/**
 * Build the journey from a student's sessions, in any order.
 *
 * Only confirmed/sent lessons count, matching the rest of the dashboard: a draft
 * is still in review, so its AI-generated focus areas haven't been vetted by the
 * tutor yet and shouldn't harden into a "recurring pattern" — or, worse, feed the
 * next lesson's analysis as though the tutor had endorsed them.
 */
export function buildJourney(history: readonly JourneySession[]): Journey {
  // Ascending: the fold needs oldest-first so "first seen" is genuinely first.
  const taught = history
    .filter((s) => s.status === "confirmed" || s.status === "sent")
    .slice()
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  const lessonsTaught = taught.length;
  const levels: LevelPoint[] = taught.map((s) => ({
    isoDate: s.isoDate,
    level: s.observedLevel,
  }));

  const vocab = foldVocab(taught);
  const { activeFocus, resolvedFocus } = foldFocus(taught);

  const levelFirst = levels[0]?.level;
  const levelLatest = levels[levels.length - 1]?.level;

  return {
    lessonsTaught,
    firstLesson: taught[0]?.isoDate,
    lastLesson: taught[lessonsTaught - 1]?.isoDate,
    vocab,
    vocabCount: vocab.length,
    activeFocus,
    resolvedFocus,
    levels,
    levelFirst,
    levelLatest,
    trajectory: trajectoryOf(levels),
    recent: taught
      .slice(-RECENT_LESSONS)
      .reverse()
      .map((s) => ({ title: s.title, isoDate: s.isoDate, endedAt: s.lessonEndedAt })),
  };
}

/* ------------------------------------------------------------------ vocab */

/** Fold every lesson's vocab into one bank, keyed on the term case-insensitively. */
function foldVocab(taught: JourneySession[]): JourneyVocab[] {
  const bank = new Map<string, JourneyVocab>();

  for (const session of taught) {
    // A single lesson listing the same term twice must not count as two lessons.
    const seenThisLesson = new Set<string>();

    for (const item of session.vocab) {
      const term = item.term.trim();
      if (!term) continue;
      const key = term.toLowerCase();

      const existing = bank.get(key);
      if (!existing) {
        bank.set(key, {
          term,
          meaning: item.meaning,
          example: item.example,
          firstSeen: session.isoDate,
          lastSeen: session.isoDate,
          lessons: 1,
        });
        seenThisLesson.add(key);
        continue;
      }

      // Later lessons win on wording: the freshest meaning and example are the
      // ones in the student's most recent context.
      existing.meaning = item.meaning || existing.meaning;
      existing.example = item.example || existing.example;
      existing.lastSeen = session.isoDate;
      if (!seenThisLesson.has(key)) {
        existing.lessons += 1;
        seenThisLesson.add(key);
      }
    }
  }

  // Recurring terms first (they're the ones worth revisiting), then most recent.
  return [...bank.values()].sort(
    (a, b) => b.lessons - a.lessons || b.lastSeen.localeCompare(a.lastSeen),
  );
}

/* ------------------------------------------------------------------ focus */

function foldFocus(taught: JourneySession[]): {
  activeFocus: JourneyFocus[];
  resolvedFocus: JourneyFocus[];
} {
  type Cluster = {
    /** Signature of every phrasing folded in, for similarity checks. */
    signatures: Signature[];
    phrasings: string[]; // oldest first while building; reversed on output
    lessons: number;
    firstSeen: string;
    lastSeen: string;
  };

  const clusters: Cluster[] = [];

  for (const session of taught) {
    // Two phrasings of the same theme inside one lesson are still one lesson.
    const countedThisLesson = new Set<Cluster>();

    for (const raw of session.focus) {
      const phrase = raw.trim();
      if (!phrase) continue;
      const signature = tokenize(phrase);
      // A phrase of nothing but stop-words can't be matched sensibly; treating it
      // as its own theme is better than merging it with an unrelated one.
      const match = signature.tokens.size ? bestCluster(clusters, signature) : undefined;

      if (!match) {
        const created: Cluster = {
          signatures: [signature],
          phrasings: [phrase],
          lessons: 1,
          firstSeen: session.isoDate,
          lastSeen: session.isoDate,
        };
        clusters.push(created);
        countedThisLesson.add(created);
        continue;
      }

      match.signatures.push(signature);
      if (!match.phrasings.includes(phrase)) match.phrasings.push(phrase);
      match.lastSeen = session.isoDate;
      if (!countedThisLesson.has(match)) {
        match.lessons += 1;
        countedThisLesson.add(match);
      }
    }
  }

  // A theme is still active if it appeared in any of the last ACTIVE_WINDOW
  // lessons — measured in lessons taught, not calendar time, since a tutor may
  // teach three lessons in a week or one a month.
  const windowStart = taught[Math.max(0, taught.length - ACTIVE_WINDOW)]?.isoDate;

  const active: JourneyFocus[] = [];
  const resolved: JourneyFocus[] = [];

  for (const cluster of clusters) {
    const entry: JourneyFocus = {
      // Newest phrasing leads — it's the tutor's current words for the problem.
      label: cluster.phrasings[cluster.phrasings.length - 1],
      phrasings: [...cluster.phrasings].reverse(),
      lessons: cluster.lessons,
      firstSeen: cluster.firstSeen,
      lastSeen: cluster.lastSeen,
    };
    const isActive = windowStart !== undefined && entry.lastSeen >= windowStart;
    (isActive ? active : resolved).push(entry);
  }

  const byPersistence = (a: JourneyFocus, b: JourneyFocus) =>
    b.lessons - a.lessons || b.lastSeen.localeCompare(a.lastSeen);

  return {
    activeFocus: active.sort(byPersistence),
    resolvedFocus: resolved.sort(byPersistence),
  };
}

/**
 * Words carried by almost every focus phrase, which would otherwise make
 * unrelated themes look similar ("work on your use of X" vs "work on your use
 * of Y" share three tokens and nothing meaningful).
 *
 * Stemmed at load (see STOP_WORDS) because the filter runs on stemmed tokens —
 * comparing them against raw entries would let "sentences" through as "sentenc"
 * while "sentence" was correctly dropped.
 */
const RAW_STOP_WORDS = [
  "the", "and", "for", "with", "your", "you", "use", "using", "used", "when",
  "more", "less", "some", "any", "that", "this", "these", "those", "from",
  "into", "onto", "than", "then", "them", "they", "their", "there", "here",
  "about", "before", "after", "during", "while", "work", "working", "practice",
  "practise", "improve", "improving", "better", "keep", "still", "often",
  "sometimes", "always", "never", "very", "much", "many", "need", "needs",
  "should", "would", "could", "can", "will", "make", "makes", "making",
  "get", "gets", "getting", "take", "takes", "put", "say", "says", "saying",
  "student", "lesson", "english", "sentence", "sentences", "word", "words",
];

const STOP_WORDS = new Set(RAW_STOP_WORDS.map(stem));

/**
 * A focus phrase reduced to what identifies its theme.
 *
 * `quoted` is kept apart from `tokens` because a phrase that names a specific
 * word — "Overuse of 'very' as an intensifier" — is about that word, and two
 * phrases quoting it are the same theme however differently they're worded. The
 * quoted word alone carries more signal than the rest of the sentence.
 */
type Signature = { tokens: Set<string>; quoted: Set<string> };

/**
 * Words inside single or double quotes — 'very', "the advice".
 *
 * A quote only opens where no letter or digit precedes it, and only closes where
 * no letter follows it. Otherwise a contraction's apostrophe passes for one: in
 * "Doesn't use 'since'" the match would be "t use", every note starting
 * "Doesn't use '…'" would share it, and a shared quoted term is decisive in
 * similarity() — so unrelated weaknesses would merge into one theme. The closing
 * rule likewise keeps 'don't know' whole instead of stopping at "don".
 */
const QUOTED = /(?<![a-z0-9])['"“”‘’]([a-z][a-z\s'-]{0,30}?)['"“”‘’](?![a-z])/g;

/**
 * Reduce a focus phrase to the content words that identify the theme.
 *
 * Parentheticals are dropped first: they hold the lesson's specific example
 * correction (e.g. `Articles before abstract nouns ("the advice" → "advice")`),
 * which is exactly the part that differs each time the theme recurs. Quotes that
 * survive that are the theme's own subject, so they're extracted before the
 * stop-word filter — which would otherwise discard the likes of 'very' and
 * 'make' as common words, losing the one token that mattered.
 */
function tokenize(phrase: string): Signature {
  const body = phrase.toLowerCase().replace(/\([^)]*\)/g, " ");

  const quoted = new Set<string>();
  for (const [, term] of body.matchAll(QUOTED)) {
    const cleaned = term.trim();
    if (cleaned) quoted.add(cleaned);
  }

  const tokens = new Set(
    body
      .replace(/[^a-z\s-]/g, " ")
      .split(/[\s-]+/)
      .map(stem)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
  // Quoted terms count as content too, so they still pull weight in the overlap
  // even when only one side of a comparison quoted them.
  for (const term of quoted) tokens.add(term);

  return { tokens, quoted };
}

/**
 * Crude singulariser — enough to make "articles"/"article" and "tenses"/"tense"
 * the same token. Deliberately not a real stemmer: over-stemming would collapse
 * genuinely different themes, and the similarity threshold already tolerates a
 * token or two of disagreement.
 *
 * The trailing "e" goes too, which looks odd in isolation ("article" → "articl")
 * but is the point: both the singular and the de-pluralised plural land on the
 * same token. Stripping only "s" would leave "articles" → "article" against a
 * bare "article", which matches, but "tenses" → "tense" against "tense" only by
 * luck — and "boxes" → "boxe" against "box" not at all. Since every word passes
 * through here, consistency matters more than the result being a real word.
 */
function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Two themes are the same if half their content words agree. */
const SIMILARITY_THRESHOLD = 0.5;

/**
 * Find the cluster this phrase belongs to, comparing against every phrasing
 * already in it rather than a merged signature — a cluster's accumulated union
 * of tokens grows with each member and would start swallowing unrelated themes.
 */
function bestCluster<T extends { signatures: Signature[] }>(
  clusters: T[],
  signature: Signature,
): T | undefined {
  let best: T | undefined;
  let bestScore = 0;

  for (const cluster of clusters) {
    for (const existing of cluster.signatures) {
      const score = similarity(signature, existing);
      if (score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }
  }

  return bestScore >= SIMILARITY_THRESHOLD ? best : undefined;
}

/**
 * Jaccard overlap on content words, with two exceptions that matter in practice:
 *
 *  - A shared quoted term is decisive. Two notes that both quote 'very' are
 *    about the student's use of "very", however else they're phrased. The
 *    trade-off is accepted knowingly: two genuinely different themes that happen
 *    to quote the same word will merge, which understates the theme count
 *    slightly. That is the cheaper error — the alternative is reporting the same
 *    recurring weakness as two unrelated one-offs, which is what the tutor is
 *    paying us to stop doing.
 *  - A strict subset always matches: "Articles" and "Articles before abstract
 *    nouns" score only 0.33 by Jaccard, but the shorter phrase is plainly the
 *    same theme stated more briefly.
 */
function similarity(a: Signature, b: Signature): number {
  for (const term of a.quoted) if (b.quoted.has(term)) return 1;

  if (!a.tokens.size || !b.tokens.size) return 0;

  let shared = 0;
  for (const token of a.tokens) if (b.tokens.has(token)) shared += 1;
  if (!shared) return 0;
  if (shared === Math.min(a.tokens.size, b.tokens.size)) return 1;

  return shared / (a.tokens.size + b.tokens.size - shared);
}

/* ------------------------------------------------------------- trajectory */

/**
 * Read the level trend from observed levels.
 *
 * Compares the average of the first and last `ACTIVE_WINDOW` lessons rather than
 * single endpoints, so one off day — a tired student, a hard topic — doesn't
 * register as a decline. Below `ACTIVE_WINDOW * 2` lessons the two windows would
 * overlap and compare a lesson against itself, so we say `early` instead of
 * inventing a trend from too little evidence.
 */
function trajectoryOf(levels: LevelPoint[]): Trajectory {
  if (levels.length < ACTIVE_WINDOW * 2) return "early";

  const index = (point: LevelPoint) => CEFR_LEVELS.indexOf(point.level);
  const mean = (points: LevelPoint[]) =>
    points.reduce((sum, p) => sum + index(p), 0) / points.length;

  const delta = mean(levels.slice(-ACTIVE_WINDOW)) - mean(levels.slice(0, ACTIVE_WINDOW));

  // Half a CEFR band: smaller drifts are noise in a per-lesson judgement.
  if (delta >= 0.5) return "rising";
  if (delta <= -0.5) return "dipping";
  return "holding";
}

/* ---------------------------------------------------------------- prompts */

/** How many known terms to hand the model. Enough to avoid re-teaching, not a dump. */
const PROMPT_VOCAB_LIMIT = 60;

/**
 * Render the journey as the plain-text block that goes into the lesson-analysis
 * prompt (src/lib/ai.ts). Returns undefined when there's no history worth
 * sending, so the first lesson's prompt stays clean rather than carrying a
 * paragraph of empty headings.
 */
export function journeyPromptBlock(journey: Journey): string | undefined {
  if (journey.lessonsTaught === 0) return undefined;

  const lines: string[] = [
    `- Lessons taught so far: ${journey.lessonsTaught}`,
  ];

  if (journey.levelFirst && journey.levelLatest) {
    const trend =
      journey.trajectory === "early"
        ? "too early to call a trend"
        : `trend: ${journey.trajectory}`;
    lines.push(
      `- Observed level: started ${journey.levelFirst}, most recently ${journey.levelLatest} (${trend})`,
    );
  }

  if (journey.activeFocus.length) {
    lines.push(
      "- Open areas to improve (theme, and how many lessons it has appeared in):",
      ...journey.activeFocus.map((f) => `    · ${f.label} — ${lessonWord(f.lessons)}`),
    );
  }

  if (journey.resolvedFocus.length) {
    lines.push(
      "- Areas that have stopped appearing (likely improving — acknowledge if the transcript confirms it):",
      ...journey.resolvedFocus.slice(0, 5).map((f) => `    · ${f.label}`),
    );
  }

  if (journey.vocab.length) {
    const terms = journey.vocab.slice(0, PROMPT_VOCAB_LIMIT).map((v) => v.term);
    lines.push(
      `- Vocabulary already taught (${journey.vocabCount} terms${
        journey.vocabCount > terms.length ? `, ${terms.length} most relevant shown` : ""
      }): ${terms.join(", ")}`,
    );
  }

  if (journey.recent.length) {
    lines.push(
      "- Recent lessons (most recent first):",
      ...journey.recent.map(
        (r) => `    · ${r.isoDate} — ${r.title}${r.endedAt ? ` (ended: ${r.endedAt})` : ""}`,
      ),
    );
  }

  return lines.join("\n");
}

function lessonWord(n: number): string {
  return n === 1 ? "1 lesson" : `${n} lessons`;
}

/** Terms from the most recent lesson, for the "recap last lesson" warm-up. */
export function warmUpTerms(journey: Journey, limit = 3): VocabItem[] {
  const last = journey.lastLesson;
  if (!last) return [];
  return journey.vocab
    .filter((v) => v.lastSeen === last)
    .slice(0, limit)
    .map((v) => ({ term: v.term, meaning: v.meaning, example: v.example }));
}
