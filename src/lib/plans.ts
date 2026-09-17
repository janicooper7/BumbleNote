// Plan definitions — the single source of truth for what each tier allows.
//
// These numbers are the ones advertised on the pricing page
// (src/components/sections/Pricing.tsx); if you change one, change both — and
// the USD amounts live in PLAN_PRICES_USD in src/lib/billing.ts. The limits bound
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
};

export const PLANS: Record<PlanId, Plan> = {
  // Two trial lessons, ever, with one student.
  free: { id: "free", name: "Free", lessons: 2, lessonWindow: "lifetime", students: 1 },
  starter: { id: "starter", name: "Starter", lessons: 30, lessonWindow: "month", students: null },
  advanced: { id: "advanced", name: "Advanced", lessons: 75, lessonWindow: "month", students: null },
  pro: { id: "pro", name: "Pro", lessons: 130, lessonWindow: "month", students: null },
  legacy: { id: "legacy", name: "Early access", lessons: 250, lessonWindow: "month", students: null },
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
