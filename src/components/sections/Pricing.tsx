"use client";

import { useState } from "react";
import Link from "next/link";
import Reveal from "../Reveal";
import CtaLink from "../CtaLink";
import { Asterisk, Display, Eyebrow, Script } from "../bn/Bn";
import { MIN_COUNTED_LESSON_MIN, PLANS } from "@/lib/plans";
import { PLAN_PRICES_USD, type PaidPlanId } from "@/lib/pricing";

// Prices and lesson limits come straight from the same modules billing and quota
// enforcement read, so the page can't advertise a number the product doesn't
// charge or allow. Only the marketing copy lives here.
//
// Drawn on cocoa; the recommended plan is the butter "ticket" with notched
// sides from template 4.

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
    <section id="pricing" className="bg-cocoa py-24 text-butter">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal className="mx-auto mb-10 max-w-3xl text-center">
          <Eyebrow className="text-sky">Pricing</Eyebrow>
          <Display className="mt-5 text-[clamp(2.3rem,5vw,3.8rem)]">
            Plans that grow
            <Script block className="text-sky">with your</Script>
            teaching week
          </Display>
          <p className="mt-6 text-lg text-butter/85">
            Try it free with 1 student and 2 lessons. No card required. Cancel anytime.
          </p>
        </Reveal>

        <Reveal className="mx-auto mb-14 flex justify-center">
          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex items-center gap-1 rounded-full bg-butter/10 p-1.5 text-[.8rem] font-semibold uppercase tracking-[.14em]"
          >
            <button
              type="button"
              aria-pressed={!annual}
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2.5 uppercase transition-all duration-300 ${
                !annual ? "bg-butter text-cocoa" : "text-butter hover:bg-butter/10"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={annual}
              onClick={() => setAnnual(true)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 uppercase transition-all duration-300 ${
                annual ? "bg-butter text-cocoa" : "text-butter hover:bg-butter/10"
              }`}
            >
              Yearly
              <span
                className={`rounded-full px-2 py-0.5 text-[.62rem] tracking-[.1em] ${
                  annual ? "bg-cocoa text-butter" : "bg-butter text-cocoa"
                }`}
              >
                2 months free
              </span>
            </button>
          </div>
        </Reveal>

        <div className="mx-auto grid max-w-md grid-cols-1 items-stretch gap-8 lg:max-w-[1080px] lg:grid-cols-3 lg:gap-6">
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
                  className={`relative flex h-full flex-col rounded-[26px] p-8 ${
                    c.featured ? "bg-butter text-cocoa lg:-my-4 lg:py-12" : "bg-white text-ink"
                  }`}
                >
                  {c.featured && (
                    <>
                      {/* the ticket's notches: two discs in the section colour */}
                      <span aria-hidden className="absolute -left-4 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-cocoa" />
                      <span aria-hidden className="absolute -right-4 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-cocoa" />
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-sky px-5 py-1.5 text-[.7rem] font-semibold uppercase tracking-[.18em] text-cocoa">
                        Recommended
                      </span>
                    </>
                  )}
                  <div className="font-display text-[1.9rem] uppercase leading-none">{plan.name}</div>
                  <div
                    className={`mb-6 mt-2.5 min-h-[3.3rem] text-[.97rem] ${
                      c.featured ? "text-cocoa/80" : "text-ink-soft"
                    }`}
                  >
                    {c.desc}
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-[3.2rem] leading-none">
                      ${annual ? price.year : price.month}
                    </span>
                    <span className={`font-medium ${c.featured ? "text-cocoa/75" : "text-muted"}`}>
                      / {annual ? "year" : "month"}
                    </span>
                  </div>

                  {/* reserves its height so the cards stay aligned when it's empty */}
                  <div
                    className="mt-2 min-h-[1.25rem] text-[.85rem] font-medium text-sky-deep"
                  >
                    {annual && `Save $${saving} a year — 2 months free`}
                  </div>

                  <div
                    className={`mb-6 mt-4 inline-flex w-fit rounded-full px-4 py-1.5 text-[.72rem] font-semibold uppercase tracking-[.14em] ${
                      c.featured ? "bg-cocoa text-butter" : "bg-butter text-cocoa"
                    }`}
                  >
                    Up to {plan.lessons} lessons / mo
                  </div>
                  <ul className="mb-8 flex flex-col gap-3">
                    {c.features.map((f) => (
                      <li
                        key={f}
                        className={`flex items-start gap-3 text-[.97rem] ${
                          c.featured ? "text-cocoa/90" : "text-ink-soft"
                        }`}
                      >
                        <Asterisk className="mt-[5px] h-3.5 w-3.5 flex-none text-cocoa" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <CtaLink
                    href={href}
                    size="md"
                    variant="primary"
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

        <Reveal className="mx-auto mt-12 max-w-2xl text-center text-[.97rem] text-butter/80">
          {!signedIn && (
            <p>
              Choosing a plan takes you to checkout once your account is created. Want to
              try first?{" "}
              <Link href="/signup" className="font-semibold text-butter underline underline-offset-4">
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
