"use client";

// Settings → Billing for tutors without a subscription: the three paid plans as
// cards with one Monthly/Yearly switch, like the public pricing section. Links
// are plain <a> for the reason BillingCard gives (no prefetched Checkouts).

import { useState } from "react";
import { PLANS } from "@/lib/plans";
import RedirectLink from "../RedirectLink";
import {
  annualSavingUsd,
  formatUsd,
  PAID_PLAN_IDS,
  PLAN_PRICES_USD,
  type BillingInterval,
} from "@/lib/pricing";

/** Same pick as the public pricing section. */
const RECOMMENDED = "advanced";

export default function PlanPicker() {
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const yearly = interval === "year";

  return (
    <div>
      <div
        role="group"
        aria-label="Billing period"
        className="inline-flex items-center gap-1 rounded-full border border-line bg-white p-1 text-[.75rem] font-semibold uppercase tracking-[.12em]"
      >
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={interval === i}
            onClick={() => setBillingInterval(i)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 uppercase transition-colors duration-200 ${
              interval === i ? "bg-cocoa text-butter" : "text-ink-soft hover:text-cocoa"
            }`}
          >
            {i === "month" ? "Monthly" : "Yearly"}
            {i === "year" && (
              <span
                className={`rounded-full px-2 py-0.5 text-[.6rem] tracking-[.08em] ${
                  yearly ? "bg-butter text-cocoa" : "bg-brand-soft text-brand-deep"
                }`}
              >
                2 months free
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PAID_PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const price = PLAN_PRICES_USD[id];
          const featured = id === RECOMMENDED;
          return (
            <div
              key={id}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                featured ? "border-cocoa bg-butter-soft" : "border-line bg-white"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-cocoa px-3 py-1 text-[.62rem] font-semibold uppercase tracking-[.14em] text-butter">
                  Recommended
                </span>
              )}
              <div className="font-display text-xl uppercase leading-none text-ink">{plan.name}</div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-[2.1rem] leading-none text-ink">
                  ${formatUsd(yearly ? price.year : price.month)}
                </span>
                <span className="text-sm text-muted">/{yearly ? "yr" : "mo"}</span>
              </div>
              {/* Reserves its line so the cards don't jump when switching. */}
              <div className="mt-1.5 min-h-[1.25rem] text-xs font-medium text-brand-deep">
                {yearly && `Save $${formatUsd(annualSavingUsd(id))} a year`}
              </div>

              <div className="mt-3 w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep">
                {plan.lessons} lessons a month
              </div>

              <RedirectLink
                href={`/dashboard/billing/checkout?plan=${id}&interval=${interval}`}
                aria-label={`Select ${plan.name}`}
                className={`mt-5 whitespace-nowrap rounded-full px-4 py-2 text-center text-sm font-semibold uppercase tracking-[.1em] transition-all duration-200 hover:-translate-y-0.5 ${
                  featured
                    ? "bg-cocoa text-butter hover:bg-cocoa-lift"
                    : "border-[1.5px] border-cocoa/25 text-cocoa hover:border-cocoa"
                }`}
              >
                Select
              </RedirectLink>
            </div>
          );
        })}
      </div>
    </div>
  );
}
