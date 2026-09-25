// syncSubscription is the only code that writes tutors.plan from Stripe, so its
// subscription -> plan mapping is tested against fixture subscriptions. Stripe
// and the database are both faked: the fake db answers the one tutor lookup and
// records what the update would have written.

import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  subscription: undefined as unknown,
  tutorRows: [] as { id: string; subscriptionId: string | null }[],
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

import { checkoutPath, isEntitled, syncSubscription } from "./billing";

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
} = {}) {
  return {
    id: over.id ?? "sub_1",
    status: over.status ?? "active",
    customer: over.customer ?? "cus_1",
    metadata: over.metadata ?? { tutorId: "tutor_1" },
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    cancel_at: over.cancelAt ?? null,
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
  fake.tutorRows = [{ id: "tutor_1", subscriptionId: null }];
  fake.updates = [];
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
});
