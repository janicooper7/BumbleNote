// Plan definitions — the single source of truth for what each tier allows.
//
// The pricing page (src/components/sections/Pricing.tsx) and the FAQ read these
// numbers directly, so changing one here changes what's advertised; only the
// feature lists in Pricing.tsx are hand-written. The USD amounts live in
// PLAN_PRICES_USD in src/lib/pricing.ts. The limits bound
// Deepgram + Anthropic spend per tutor. Every new tutor lands on `free`; after
// that `tutors.plan` is set only by Stripe, via syncSubscription().

// `legacy` is never sold: it's the tier tutors who predate billing were
// grandfathered onto, so the September 2026 repricing didn't cap anyone who was
// already live. It doesn't appear on the pricing page.
export const PLAN_IDS = ["free", "starter", "advanced", "pro", "legacy"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  id: PlanId;
  name: string;
  /** Lessons that may be processed per `lessonWindow`. */
  lessons: number;
  /**
   * `month` resets on the 1st (UTC). `lifetime` never resets — it's the free
   * trial, counted from `tutors.lessons_created` so deleting a lesson doesn't
   * hand the trial back.
   */
  lessonWindow: "month" | "lifetime";
  /** Student profiles allowed, or null for no limit. */
  students: number | null;
  /**
   * Most unused lessons a subscriber can carry into the next month
   * (src/lib/credits.ts). Kept small on purpose, so a tutor can't bank months of
   * allowance and then pause or coast on it. 0 = no rollover.
   */
  rolloverCap: number;
};

export const PLANS: Record<PlanId, Plan> = {
  // Two trial lessons, ever, with one student.
  free: { id: "free", name: "Free", lessons: 2, lessonWindow: "lifetime", students: 1, rolloverCap: 0 },
  starter: { id: "starter", name: "Starter", lessons: 30, lessonWindow: "month", students: null, rolloverCap: 5 },
  advanced: { id: "advanced", name: "Advanced", lessons: 75, lessonWindow: "month", students: null, rolloverCap: 10 },
  pro: { id: "pro", name: "Pro", lessons: 130, lessonWindow: "month", students: null, rolloverCap: 15 },
  // Not a subscription, so no bank: it keeps the plain calendar-month reset.
  legacy: { id: "legacy", name: "Early access", lessons: 250, lessonWindow: "month", students: null, rolloverCap: 0 },
};

/**
 * Recordings shorter than this don't use a lesson credit. A call that drops five
 * minutes in shouldn't cost the tutor a lesson; the pieces can be combined
 * afterwards (mergeSessions in src/app/actions/merge.ts), and the combined lesson
 * uses one credit once it reaches this length.
 */
export const MIN_COUNTED_LESSON_MIN = 25;

export function countsAsLesson(durationMin: number): boolean {
  return durationMin >= MIN_COUNTED_LESSON_MIN;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function planFor(id: string | null | undefined): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS.free;
}
