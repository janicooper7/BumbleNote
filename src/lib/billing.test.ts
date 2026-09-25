// syncSubscription is the only code that writes tutors.plan from Stripe, so its
// subscription -> plan mapping is tested against fixture subscriptions. Stripe
// and the database are both faked: the fake db answers the one tutor lookup and
// records what the update would have written.

import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  subscription: undefined as unknown,
  tutorRows: [] as {
    id: string;
    subscriptionId: string | null;
    creditsSince?: Date | null;
    pausedAt?: Date | null;
    pauseResumesAt?: Date | null;
  }[],
  grantCalls: [] as string[],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("stripe", () => {
  class Stripe {
    static errors = { StripeInvalidRequestError: class extends Error {} };
    subscriptions = { retrieve: async () => fake.subscription };
  }
  return { default: Stripe };
});

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => fake.tutorRows }) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          fake.updates.push(values);
        },
      }),
    }),
  },
}));

// The rollover ledger has its own real-Postgres tests (quota.db.test.ts); here
// only the order of calls around the tutor update matters.
vi.mock("@/lib/credits", async (importActual) => ({
  ...(await importActual<typeof import("./credits")>()),
  ensureCreditGrants: async () => {
    fake.grantCalls.push(fake.updates.length ? "after" : "before");
  },
  topUpCurrentMonth: async () => {
    fake.grantCalls.push("topUp");
  },
}));

import { checkoutPath, isEntitled, pauseEndsAt, syncSubscription } from "./billing";

const PERIOD_END = 1_790_000_000; // seconds

function subscription(over: {
  id?: string;
  status?: string;
  lookupKey?: string | null;
  customer?: string | { id: string };
  metadata?: Record<string, string>;
  cancelAtPeriodEnd?: boolean;
  cancelAt?: number | null;
  noItems?: boolean;
  pauseResumesAt?: number | null;
  schedulePhases?: { start_date: number; lookupKey: string }[];
} = {}) {
  return {
    id: over.id ?? "sub_1",
    status: over.status ?? "active",
    customer: over.customer ?? "cus_1",
    metadata: over.metadata ?? { tutorId: "tutor_1" },
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    cancel_at: over.cancelAt ?? null,
    pause_collection:
      over.pauseResumesAt === undefined ? null : { behavior: "void", resumes_at: over.pauseResumesAt },
    schedule: over.schedulePhases
      ? {
          id: "sub_sched_1",
          phases: over.schedulePhases.map((p) => ({
            start_date: p.start_date,
            items: [{ price: { id: "price_x", lookup_key: p.lookupKey } }],
          })),
        }
      : null,
    items: {
      data: over.noItems
        ? []
        : [
            {
              current_period_end: PERIOD_END,
              price: {
                id: "price_1",
                lookup_key: over.lookupKey === undefined ? "bumblenote_advanced_year" : over.lookupKey,
              },
            },
          ],
    },
  };
}

beforeEach(() => {
  fake.subscription = subscription();
  fake.tutorRows = [{ id: "tutor_1", subscriptionId: null, creditsSince: null, pausedAt: null, pauseResumesAt: null }];
  fake.updates = [];
  fake.grantCalls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("isEntitled", () => {
  it.each(["active", "trialing", "past_due"])("keeps the paid plan while %s", (status) => {
    expect(isEntitled(status)).toBe(true);
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "", null, undefined])(
    "drops the paid plan when %j",
    (status) => {
      expect(isEntitled(status)).toBe(false);
    },
  );
});

describe("checkoutPath", () => {
  it("builds a checkout link for a paid plan, annual only when asked", () => {
    expect(checkoutPath("pro", "annual")).toBe("/dashboard/billing/checkout?plan=pro&interval=year");
    expect(checkoutPath("starter", "monthly")).toBe(
      "/dashboard/billing/checkout?plan=starter&interval=month",
    );
    expect(checkoutPath("starter", undefined)).toBe(
      "/dashboard/billing/checkout?plan=starter&interval=month",
    );
  });

  it.each(["free", "legacy", "enterprise", undefined, 42])("returns null for plan %j", (plan) => {
    expect(checkoutPath(plan, "annual")).toBeNull();
  });
});

describe("syncSubscription", () => {
  it("puts an active subscriber on the plan and interval from the price's lookup key", async () => {
    await syncSubscription("sub_1");
    expect(fake.updates).toEqual([
      {
        plan: "advanced",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        subscriptionStatus: "active",
        billingInterval: "year",
        currentPeriodEnd: new Date(PERIOD_END * 1000),
        cancelAtPeriodEnd: false,
        creditsSince: expect.any(Date),
        pausedAt: null,
        pauseResumesAt: null,
        pendingPlan: null,
        pendingPlanAt: null,
      },
    ]);
  });

  it("keeps the plan while a card payment is being retried", async () => {
    fake.subscription = subscription({ status: "past_due", lookupKey: "bumblenote_starter_month" });
    await syncSubscription("sub_1");
    expect(fake.updates[0]).toMatchObject({ plan: "starter", subscriptionStatus: "past_due" });
  });

  it.each(["canceled", "unpaid", "incomplete_expired"])("downgrades to free when %s", async (status) => {
    fake.tutorRows = [{ id: "tutor_1", subscriptionId: "sub_1" }];
    fake.subscription = subscription({ status });
    await syncSubscription("sub_1");
    expect(fake.updates[0]).toMatchObject({
      plan: "free",
      subscriptionStatus: status,
      billingInterval: "year",
    });
  });

  it("flags a scheduled cancellation either way Stripe expresses it", async () => {
    fake.subscription = subscription({ cancelAtPeriodEnd: true });
    await syncSubscription("sub_1");
    fake.subscription = subscription({ cancelAt: PERIOD_END });
    await syncSubscription("sub_1");
    expect(fake.updates.map((u) => u.cancelAtPeriodEnd)).toEqual([true, true]);
  });

  it("accepts an expanded customer object", async () => {
    fake.subscription = subscription({ customer: { id: "cus_expanded" } });
    await syncSubscription("sub_1");
    expect(fake.updates[0].stripeCustomerId).toBe("cus_expanded");
  });

  it("refuses to guess the plan for a live subscription on an unknown price", async () => {
    fake.subscription = subscription({ lookupKey: "some_other_product" });
    await expect(syncSubscription("sub_1")).rejects.toThrow(/no BumbleNote lookup key/);
    expect(fake.updates).toEqual([]);
  });

  it("still records an ended subscription on an unknown price, as free", async () => {
    fake.subscription = subscription({ status: "canceled", lookupKey: null });
    await syncSubscription("sub_1");
    expect(fake.updates[0]).toMatchObject({ plan: "free", billingInterval: null });
  });

  it("ignores a late event from an old subscription once the tutor has a new one", async () => {
    fake.tutorRows = [{ id: "tutor_1", subscriptionId: "sub_new" }];
    fake.subscription = subscription({ id: "sub_old", status: "canceled" });
    await syncSubscription("sub_old");
    expect(fake.updates).toEqual([]);
  });

  it("does move the tutor onto a different subscription that is live", async () => {
    fake.tutorRows = [{ id: "tutor_1", subscriptionId: "sub_old" }];
    fake.subscription = subscription({ id: "sub_new", lookupKey: "bumblenote_pro_month" });
    await syncSubscription("sub_new");
    expect(fake.updates[0]).toMatchObject({ plan: "pro", stripeSubscriptionId: "sub_new" });
  });

  it("does nothing for a subscription with no matching tutor", async () => {
    fake.tutorRows = [];
    await syncSubscription("sub_1");
    expect(fake.updates).toEqual([]);
  });

  it("clears the period end when the subscription has no items", async () => {
    fake.subscription = subscription({ status: "canceled", noItems: true });
    await syncSubscription("sub_1");
    expect(fake.updates[0]).toMatchObject({ plan: "free", currentPeriodEnd: null, billingInterval: null });
  });

  it("settles the rollover ledger before writing, then grants and tops up after", async () => {
    await syncSubscription("sub_1");
    expect(fake.grantCalls).toEqual(["before", "after", "topUp"]);
  });

  it("keeps the rollover bank's start across syncs, and drops it when the subscription ends", async () => {
    const since = new Date("2026-06-03T10:00:00Z");
    fake.tutorRows = [{ id: "tutor_1", subscriptionId: "sub_1", creditsSince: since }];
    await syncSubscription("sub_1");
    fake.subscription = subscription({ status: "canceled" });
    await syncSubscription("sub_1");
    expect(fake.updates.map((u) => u.creditsSince)).toEqual([since, null]);
  });

  it("records a new pause starting now, ending when Stripe resumes collection", async () => {
    const resumes = Math.floor(Date.now() / 1000) + 30 * 86400;
    fake.subscription = subscription({ pauseResumesAt: resumes });
    await syncSubscription("sub_1");
    const u = fake.updates[0];
    expect(u.pausedAt).toBeInstanceOf(Date);
    expect(Math.abs((u.pausedAt as Date).getTime() - Date.now())).toBeLessThan(5000);
    expect(u.pauseResumesAt).toEqual(new Date(resumes * 1000));
  });

  it("keeps a running pause's start, and closes it when resumed early", async () => {
    const pausedAt = new Date(Date.now() - 5 * 86400_000);
    const resumesAt = new Date(Date.now() + 25 * 86400_000);
    fake.tutorRows = [{ id: "tutor_1", subscriptionId: "sub_1", pausedAt, pauseResumesAt: resumesAt }];
    fake.subscription = subscription({ pauseResumesAt: Math.floor(resumesAt.getTime() / 1000) });
    await syncSubscription("sub_1");
    expect(fake.updates[0].pausedAt).toBe(pausedAt);

    fake.subscription = subscription();
    await syncSubscription("sub_1");
    expect(fake.updates[1].pausedAt).toBe(pausedAt);
    expect((fake.updates[1].pauseResumesAt as Date).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("reads a downgrade queued on the subscription's schedule", async () => {
    const at = Math.floor(Date.now() / 1000) + 10 * 86400;
    fake.subscription = subscription({
      lookupKey: "bumblenote_pro_month",
      schedulePhases: [
        { start_date: at - 30 * 86400, lookupKey: "bumblenote_pro_month" },
        { start_date: at, lookupKey: "bumblenote_starter_month" },
      ],
    });
    await syncSubscription("sub_1");
    expect(fake.updates[0]).toMatchObject({ pendingPlan: "starter", pendingPlanAt: new Date(at * 1000) });
  });
});

describe("pauseEndsAt", () => {
  it("is one calendar month later", () => {
    expect(pauseEndsAt(new Date("2026-10-10T12:00:00Z"))).toEqual(new Date("2026-11-10T12:00:00Z"));
  });

  it("clamps to the end of a shorter month", () => {
    expect(pauseEndsAt(new Date("2027-01-31T12:00:00Z"))).toEqual(new Date("2027-02-28T12:00:00Z"));
  });
});
