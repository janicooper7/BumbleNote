import { describe, expect, it } from "vitest";
import { countsAsLesson, isPlanId, MIN_COUNTED_LESSON_MIN, PLAN_IDS, PLANS, planFor } from "./plans";
import {
  annualSavingUsd,
  formatUsd,
  isPaidPlanId,
  PAID_PLAN_IDS,
  PLAN_PRICES_USD,
  parseLookupKey,
  priceLookupKey,
  toCents,
} from "./pricing";

describe("planFor", () => {
  it.each(PLAN_IDS)("returns the %s plan for its own id", (id) => {
    expect(planFor(id)).toBe(PLANS[id]);
    expect(planFor(id).id).toBe(id);
  });

  it.each([null, undefined, "", "Pro", "enterprise", "free "])(
    "falls back to free for %j",
    (id) => {
      expect(planFor(id)).toBe(PLANS.free);
    },
  );

  it("doesn't treat inherited object keys as plans", () => {
    expect(isPlanId("toString")).toBe(false);
    expect(isPlanId("__proto__")).toBe(false);
    expect(planFor("constructor")).toBe(PLANS.free);
  });

  it("keeps free a lifetime trial and every paid tier monthly", () => {
    expect(PLANS.free.lessonWindow).toBe("lifetime");
    for (const id of PAID_PLAN_IDS) expect(PLANS[id].lessonWindow).toBe("month");
  });
});

describe("countsAsLesson", () => {
  it("counts from exactly the minimum", () => {
    expect(MIN_COUNTED_LESSON_MIN).toBe(25);
    expect(countsAsLesson(25)).toBe(true);
    expect(countsAsLesson(60)).toBe(true);
  });

  it("doesn't count anything shorter", () => {
    expect(countsAsLesson(24.99)).toBe(false);
    expect(countsAsLesson(0)).toBe(false);
  });
});

describe("pricing", () => {
  it("converts to cents without float drift", () => {
    expect(toCents(15.99)).toBe(1599);
    expect(toCents(159.9)).toBe(15990);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("formats whole dollars without decimals and cents with two", () => {
    expect(formatUsd(19)).toBe("19");
    expect(formatUsd(15.99)).toBe("15.99");
    expect(formatUsd(159.9)).toBe("159.90");
  });

  it("prices annual at ten months, so the saving is two months", () => {
    for (const id of PAID_PLAN_IDS) {
      expect(toCents(PLAN_PRICES_USD[id].year)).toBe(toCents(PLAN_PRICES_USD[id].month) * 10);
      expect(annualSavingUsd(id)).toBeCloseTo(PLAN_PRICES_USD[id].month * 2, 2);
    }
    expect(annualSavingUsd("starter")).toBe(31.98);
  });

  it("round-trips every plan and interval through its Stripe lookup key", () => {
    for (const plan of PAID_PLAN_IDS) {
      for (const interval of ["month", "year"] as const) {
        expect(parseLookupKey(priceLookupKey(plan, interval))).toEqual({ plan, interval });
      }
    }
  });

  it.each([
    null,
    undefined,
    "",
    "bumblenote_free_month", // not a paid plan
    "bumblenote_legacy_month",
    "bumblenote_pro_week",
    "bumblenote_pro_month_v2",
    "xbumblenote_pro_month",
    "other_pro_month",
  ])("rejects lookup key %j", (key) => {
    expect(parseLookupKey(key)).toBeNull();
  });

  it("only recognises the sold tiers as paid", () => {
    expect(isPaidPlanId("starter")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(isPaidPlanId("legacy")).toBe(false);
    expect(isPaidPlanId(undefined)).toBe(false);
  });
});
