import { describe, expect, it } from "vitest";
import { buildJourney, journeyPromptBlock, warmUpTerms, type JourneySession } from "./journey";
import type { CEFRLevel, VocabItem } from "./mock";

let n = 0;
function lesson(
  isoDate: string,
  over: Partial<Omit<JourneySession, "vocab">> & { vocab?: (string | VocabItem)[] } = {},
): JourneySession {
  n += 1;
  return {
    status: "confirmed",
    observedLevel: "B1",
    focus: [],
    title: `Lesson ${n}`,
    lessonEndedAt: "",
    ...over,
    isoDate,
    vocab: (over.vocab ?? []).map((v) =>
      typeof v === "string" ? { term: v, meaning: `${v} meaning`, example: `${v} example` } : v,
    ),
  };
}

const levels = (...ls: CEFRLevel[]) =>
  ls.map((observedLevel, i) => lesson(`2026-01-${String(i + 1).padStart(2, "0")}`, { observedLevel }));

describe("buildJourney — empty history", () => {
  it("is an empty journey with nothing to prompt", () => {
    const j = buildJourney([]);
    expect(j).toMatchObject({
      lessonsTaught: 0,
      vocab: [],
      vocabCount: 0,
      activeFocus: [],
      resolvedFocus: [],
      levels: [],
      trajectory: "early",
      recent: [],
    });
    expect(j.firstLesson).toBeUndefined();
    expect(j.levelLatest).toBeUndefined();
    expect(journeyPromptBlock(j)).toBeUndefined();
    expect(warmUpTerms(j)).toEqual([]);
  });

  it("ignores drafts entirely — the tutor hasn't vetted them yet", () => {
    const j = buildJourney([
      lesson("2026-01-01", { status: "draft", vocab: ["gist"], focus: ["Articles"] }),
    ]);
    expect(j.lessonsTaught).toBe(0);
    expect(j.vocab).toEqual([]);
    expect(j.activeFocus).toEqual([]);
    expect(journeyPromptBlock(j)).toBeUndefined();
  });
});

describe("buildJourney — single lesson", () => {
  const only = lesson("2026-03-02", {
    status: "sent",
    title: "Job interviews",
    lessonEndedAt: "Unit 4, page 30",
    observedLevel: "B2",
    vocab: ["shortlist", "  ", "Leverage"],
    focus: ["Present perfect vs past simple", ""],
  });
  const j = buildJourney([only]);

  it("summarises the one lesson", () => {
    expect(j.lessonsTaught).toBe(1);
    expect(j.firstLesson).toBe("2026-03-02");
    expect(j.lastLesson).toBe("2026-03-02");
    expect(j.levelFirst).toBe("B2");
    expect(j.levelLatest).toBe("B2");
    expect(j.trajectory).toBe("early");
    expect(j.vocab.map((v) => v.term).sort()).toEqual(["Leverage", "shortlist"]); // blank dropped
    expect(j.activeFocus.map((f) => f.label)).toEqual(["Present perfect vs past simple"]);
    expect(j.resolvedFocus).toEqual([]);
    expect(j.recent).toEqual([
      { title: "Job interviews", isoDate: "2026-03-02", endedAt: "Unit 4, page 30" },
    ]);
  });

  it("renders a prompt block without inventing a trend", () => {
    expect(journeyPromptBlock(j)).toBe(
      [
        "- Lessons taught so far: 1",
        "- Observed level: started B2, most recently B2 (too early to call a trend)",
        "- Open areas to improve (theme, and how many lessons it has appeared in):",
        "    · Present perfect vs past simple — 1 lesson",
        `- Vocabulary already taught (2 terms): ${j.vocab.map((v) => v.term).join(", ")}`,
        "- Recent lessons (most recent first):",
        "    · 2026-03-02 — Job interviews (ended: Unit 4, page 30)",
      ].join("\n"),
    );
  });

  it("offers the lesson's terms for the warm-up", () => {
    expect(warmUpTerms(j).map((t) => t.term).sort()).toEqual(["Leverage", "shortlist"]);
    expect(warmUpTerms(j, 1)).toHaveLength(1);
  });
});

describe("buildJourney — multiple lessons", () => {
  // Deliberately passed out of order.
  const history = [
    lesson("2026-02-10", {
      title: "Third",
      vocab: [{ term: "gist", meaning: "main idea (updated)", example: "" }, "deadline"],
      focus: ["Article use with abstract nouns"],
    }),
    lesson("2026-02-01", {
      title: "First",
      vocab: ["Gist", "gist", "commute"],
      focus: ['Articles before abstract nouns ("the advice" → "advice")', "Pronouncing -ed endings"],
    }),
    lesson("2026-02-20", { title: "Draft", status: "draft", vocab: ["ignored"] }),
    lesson("2026-02-05", {
      title: "Second",
      vocab: ["commute", "GIST"],
      focus: ["Overuse of 'very' as an intensifier"],
    }),
    lesson("2026-02-15", { title: "Fourth", focus: ["Relies on 'very' too much"] }),
  ];
  const j = buildJourney(history);

  it("counts only taught lessons and orders them by date", () => {
    expect(j.lessonsTaught).toBe(4);
    expect(j.firstLesson).toBe("2026-02-01");
    expect(j.lastLesson).toBe("2026-02-15");
    expect(j.recent.map((r) => r.title)).toEqual(["Fourth", "Third", "Second"]);
  });

  it("folds vocab case-insensitively, once per lesson, keeping the first spelling and latest meaning", () => {
    const gist = j.vocab.find((v) => v.term.toLowerCase() === "gist")!;
    expect(gist).toMatchObject({
      term: "Gist",
      lessons: 3, // listed twice in the first lesson, still one lesson
      firstSeen: "2026-02-01",
      lastSeen: "2026-02-10",
      meaning: "main idea (updated)",
      example: "GIST example", // blank example in the latest lesson doesn't wipe the old one
    });
    expect(j.vocabCount).toBe(3);
    expect(j.vocab.find((v) => v.term === "ignored")).toBeUndefined();
    // Recurring first, then most recent.
    expect(j.vocab.map((v) => v.term)).toEqual(["Gist", "commute", "deadline"]);
  });

  it("clusters differently-worded focus notes into one theme", () => {
    const articles = [...j.activeFocus, ...j.resolvedFocus].find((f) =>
      f.phrasings.some((p) => p.startsWith("Article")),
    )!;
    expect(articles.lessons).toBe(2);
    expect(articles.label).toBe("Article use with abstract nouns"); // newest phrasing leads
    expect(articles.phrasings).toHaveLength(2);

    const very = j.activeFocus.find((f) => f.label === "Relies on 'very' too much")!;
    expect(very.lessons).toBe(2); // shared quoted word decides it
    expect(very.phrasings).toEqual(["Relies on 'very' too much", "Overuse of 'very' as an intensifier"]);
  });

  it("marks a theme absent from the last three lessons as resolved", () => {
    expect(j.resolvedFocus.map((f) => f.label)).toEqual(["Pronouncing -ed endings"]);
    expect(j.activeFocus.map((f) => f.label)).not.toContain("Pronouncing -ed endings");
  });

  it("keeps unrelated themes apart", () => {
    const all = [...j.activeFocus, ...j.resolvedFocus];
    expect(all).toHaveLength(3);
  });

  it("renders the history into the prompt", () => {
    const block = journeyPromptBlock(j)!;
    expect(block).toContain("- Lessons taught so far: 4");
    expect(block).toContain("    · Article use with abstract nouns — 2 lessons");
    expect(block).toContain("- Areas that have stopped appearing");
    expect(block).toContain("    · Pronouncing -ed endings");
    expect(block).toContain("- Vocabulary already taught (3 terms): Gist, commute, deadline");
    expect(block).toContain("    · 2026-02-15 — Fourth");
    expect(block).not.toContain("(ended: )");
  });

  it("warms up with only the last lesson's terms", () => {
    // The last lesson taught (Fourth) had no vocab.
    expect(warmUpTerms(j)).toEqual([]);
  });

  it("truncates a large vocabulary bank in the prompt", () => {
    const big = buildJourney([
      lesson("2026-01-01", { vocab: Array.from({ length: 65 }, (_, i) => `term${i}`) }),
    ]);
    expect(journeyPromptBlock(big)).toContain("(65 terms, 60 most relevant shown)");
  });
});

describe("trajectory", () => {
  it("stays early below six lessons", () => {
    expect(buildJourney(levels("A1", "A2", "B1", "B2", "C1")).trajectory).toBe("early");
  });

  it("compares the first and last three lessons", () => {
    expect(buildJourney(levels("A2", "A2", "A2", "B1", "B1", "B2")).trajectory).toBe("rising");
    expect(buildJourney(levels("B2", "B2", "B2", "B1", "B1", "B1")).trajectory).toBe("dipping");
    // One off day doesn't register as a decline.
    expect(buildJourney(levels("B1", "B1", "B1", "B1", "A2", "B1")).trajectory).toBe("holding");
  });

  it("puts the trend into the prompt", () => {
    const block = journeyPromptBlock(buildJourney(levels("A2", "A2", "A2", "B1", "B1", "B2")))!;
    expect(block).toContain("started A2, most recently B2 (trend: rising)");
  });
});

describe("focus clustering — known weaknesses", () => {
  it("keeps notes about different quoted words apart", () => {
    const j = buildJourney([
      lesson("2026-01-01", { focus: ["Does not use 'since' for durations"] }),
      lesson("2026-01-02", { focus: ["Does not use 'although' in writing"] }),
    ]);
    expect(j.activeFocus).toHaveLength(2);
  });

  it("keeps them apart even when the notes contain a contraction", () => {
    // Same two notes as above, with "Does not" contracted. A contraction's
    // apostrophe must not open a quote, or both notes would "quote" "t use".
    const j = buildJourney([
      lesson("2026-01-01", { focus: ["Doesn't use 'since' for durations"] }),
      lesson("2026-01-02", { focus: ["Doesn't use 'although' in writing"] }),
    ]);
    expect(j.activeFocus).toHaveLength(2);
  });

  it("still groups notes that quote the same word around contractions", () => {
    const j = buildJourney([
      lesson("2026-01-01", { focus: ["You're dropping 'the' before superlatives"] }),
      lesson("2026-01-02", { focus: ["Doesn't put 'the' in front of the biggest/best"] }),
    ]);
    expect(j.activeFocus).toHaveLength(1);
  });

  it("reads a quoted phrase that itself contains an apostrophe as one term", () => {
    // Cut off at the inner apostrophe, both would quote "i don" and merge.
    const j = buildJourney([
      lesson("2026-01-01", { focus: ["Leans on 'I don't know' when unsure"] }),
      lesson("2026-01-02", { focus: ["Overuses 'I don't mind' in negotiations"] }),
    ]);
    expect(j.activeFocus).toHaveLength(2);
  });
});
