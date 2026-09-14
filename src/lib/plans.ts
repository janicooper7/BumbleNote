// Plan definitions — the single source of truth for what each tier allows.
//
// These numbers are the ones advertised on the pricing page
// (src/components/sections/Pricing.tsx); if you change one, change both. Billing
// isn't wired up yet, so nothing here charges anyone — the limits exist so that
// public signup can't turn into unbounded Deepgram + Anthropic spend on lessons
// nobody is paying for. Stripe will later set `tutors.plan`; today every new
// tutor lands on `free`.

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
  // One trial lesson, ever, with one student.
  free: { id: "free", name: "Free", lessons: 1, lessonWindow: "lifetime", students: 1 },
  starter: { id: "starter", name: "Starter", lessons: 30, lessonWindow: "month", students: null },
  advanced: { id: "advanced", name: "Advanced", lessons: 75, lessonWindow: "month", students: null },
  pro: { id: "pro", name: "Pro", lessons: 130, lessonWindow: "month", students: null },
  legacy: { id: "legacy", name: "Early access", lessons: 250, lessonWindow: "month", students: null },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function planFor(id: string | null | undefined): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS.free;
}
