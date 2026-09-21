"use client";

import { useState } from "react";
import Link from "next/link";
import Reveal from "../Reveal";
import CtaLink from "../CtaLink";
import { MIN_COUNTED_LESSON_MIN, PLANS } from "@/lib/plans";
import { PLAN_PRICES_USD, type PaidPlanId } from "@/lib/pricing";

// Prices and lesson limits come straight from the same modules billing and quota
// enforcement read, so the page can't advertise a number the product doesn't
// charge or allow. Only the marketing copy lives here.

type Card = {
  id: PaidPlanId;
  desc: string;
  features: string[];
  featured: boolean;
};

const cards: Card[] = [
  {
    id: "starter",
    desc: "Your part-time roster, a few lessons a week.",
    features: [
      "Student & tutor feedback",
      "Full student journey & history",
      "Branded PDF + email delivery",
      "Unlimited student profiles",
    ],
    featured: false,
  },
  {
    id: "advanced",
    desc: "For committed tutors teaching most days.",
    features: [
      "Everything in Starter",
      "Priority processing",
      "Deeper per-student insights",
      "Email support",
    ],
    featured: true,
  },
  {
    id: "pro",
    desc: "For full-time tutors teaching every day.",
    features: ["Everything in Advanced", "Fastest processing", "Priority support"],
    featured: false,
  },
];

export default function Pricing({ signedIn = false }: { signedIn?: boolean }) {
  // One switch for the whole table, so the three plans are always compared in
  // the same billing period.
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto w-full max-w-[1240px] px-8">
        <Reveal className="mx-auto mb-8 max-w-2xl text-center">
          <div className="text-[.82rem] font-bold uppercase tracking-widest text-brand-deep">
            Pricing
          </div>
          <h2 className="mt-4 font-display text-[clamp(2rem,3.8vw,2.9rem)] font-medium tracking-tight">
            Plans that scale with your teaching week.
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            Try it free with 1 student and 2 lessons. No card required. Cancel anytime.
          </p>
        </Reveal>

        <Reveal className="mx-auto mb-12 flex justify-center">
          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-brand-soft/50 p-1 text-[.92rem] font-semibold shadow-soft-sm"
          >
            <button
              type="button"
              aria-pressed={!annual}
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 transition-all duration-300 ${
                !annual ? "bg-brand text-ink shadow-soft-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={annual}
              onClick={() => setAnnual(true)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2 transition-all duration-300 ${
                annual ? "bg-brand text-ink shadow-soft-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              Yearly
              <span
                className={`rounded-full px-2 py-0.5 text-[.66rem] font-bold uppercase tracking-wide ${
                  annual ? "bg-white/50 text-ink" : "bg-brand-soft text-brand-deep"
                }`}
              >
                2 months free
              </span>
            </button>
          </div>
        </Reveal>

        <div className="mx-auto grid max-w-md grid-cols-1 items-stretch gap-6 lg:max-w-[1040px] lg:grid-cols-3">
          {cards.map((c, i) => {
            const plan = PLANS[c.id];
            const price = PLAN_PRICES_USD[c.id];
            const saving = price.month * 12 - price.year;
            // Signed-in tutors already have an account: send them to billing
            // rather than round-tripping through signup.
            const href = signedIn
              ? "/dashboard/settings"
              : `/signup?plan=${c.id}${annual ? "&billing=annual" : ""}`;

            return (
              <Reveal key={c.id} delay={i * 80} className="h-full">
                <div
                  className={`relative flex h-full flex-col rounded-[22px] bg-surface p-7 ${
                    c.featured
                      ? "border-[1.5px] border-brand shadow-soft-md"
                      : "border border-line shadow-soft-sm"
                  }`}
                >
                  {c.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-4 py-1 text-[.74rem] font-bold tracking-wide text-ink">
                      Recommended
                    </span>
                  )}
                  <div className="font-display text-[1.35rem] font-semibold">{plan.name}</div>
                  <div className="mb-5 mt-1.5 min-h-[3.3rem] text-[.92rem] text-ink-soft">
                    {c.desc}
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-[2.6rem] font-semibold tracking-tight">
                      ${annual ? price.year : price.month}
                    </span>
                    <span className="font-medium text-muted">/ {annual ? "year" : "month"}</span>
                  </div>

                  {/* reserves its height so the cards stay aligned when it's empty */}
                  <div className="mt-1 min-h-[1.25rem] text-[.82rem] font-medium text-brand-deep">
                    {annual && `Save $${saving} a year — 2 months free`}
                  </div>

                  <div className="mb-6 mt-3 inline-flex w-fit rounded-full bg-brand-soft px-3 py-1 text-[.82rem] font-semibold text-brand-deep">
                    Up to {plan.lessons} lessons / mo
                  </div>
                  <ul className="mb-7 flex flex-col gap-3">
                    {c.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[.94rem] text-ink-soft">
                        <span
                          aria-hidden
                          className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-[7px] bg-brand-soft text-[.68rem] text-brand-deep"
                        >
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <CtaLink
                    href={href}
                    size="md"
                    variant={c.featured ? "primary" : "secondary"}
                    arrow={c.featured}
                    className="mt-auto w-full"
                  >
                    Choose {plan.name}
                  </CtaLink>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mx-auto mt-8 max-w-2xl text-center text-[.95rem] text-ink-soft">
          {!signedIn && (
            <p>
              Choosing a plan takes you to checkout once your account is created. Want to
              try first?{" "}
              <Link href="/signup" className="font-semibold text-brand-deep underline-offset-4 hover:underline">
                Start free
              </Link>{" "}
              — 1 student, 2 lessons, no card required.
            </p>
          )}
          <p className={signedIn ? "" : "mt-2"}>
            A recording counts as a lesson once it runs {MIN_COUNTED_LESSON_MIN} minutes or
            longer, so a call that drops early doesn&apos;t cost you one.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
