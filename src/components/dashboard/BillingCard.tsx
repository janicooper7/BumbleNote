// Settings → Billing. Server component: everything it shows comes from the tutor
// row, which only lib/billing syncSubscription() writes. Links to the billing
// routes are plain <a>, not <Link> — they're redirects to Stripe, and a
// prefetch would create Checkout sessions nobody asked for.

import { isEntitled, PAID_PLAN_IDS, PLAN_PRICES_USD, pauseEndsAt } from "@/lib/billing";
import { isPausedAt } from "@/lib/credits";
import { formatUsd, isPaidPlanId } from "@/lib/pricing";
import { PLANS, type Plan } from "@/lib/plans";
import type { TutorProfile } from "@/db/queries";
import PlanControls, { type PlanOption } from "./PlanControls";

type Notice = "success" | "pending" | "cancelled" | "error";

const NOTICES: Record<Notice, { tone: "good" | "info" | "bad"; text: string }> = {
  success: { tone: "good", text: "You're all set — thanks for subscribing." },
  pending: {
    tone: "info",
    text: "Payment received. Your plan will update in a moment — refresh if it hasn't.",
  },
  cancelled: { tone: "info", text: "Checkout cancelled — you haven't been charged." },
  error: {
    tone: "bad",
    text: "We couldn't reach our payment provider. Try again, or email us if it keeps happening.",
  },
};

export function isBillingNotice(value: unknown): value is Notice {
  return typeof value === "string" && value in NOTICES;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function BillingCard({
  tutor,
  plan,
  rolledOver,
  notice,
}: {
  tutor: TutorProfile;
  plan: Plan;
  /** Lessons carried into this month, for the pause copy. */
  rolledOver: number;
  notice?: Notice;
}) {
  const subscribed = isEntitled(tutor.subscriptionStatus);
  const pastDue = tutor.subscriptionStatus === "past_due";
  const paused = isPausedAt(tutor.pausedAt, tutor.pauseResumesAt);
  const interval = tutor.billingInterval ?? "month";

  // The other paid plans, priced on the tutor's own interval.
  const current = isPaidPlanId(plan.id) ? plan.id : null;
  const options: PlanOption[] = current
    ? PAID_PLAN_IDS.filter((id) => id !== current).map((id) => ({
        id,
        name: PLANS[id].name,
        lessons: PLANS[id].lessons,
        price: `$${formatUsd(PLAN_PRICES_USD[id][interval])}/${interval === "year" ? "yr" : "mo"}`,
        direction: PLANS[id].lessons > plan.lessons ? "up" : "down",
      }))
    : [];

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-soft-sm">
      <div className="font-semibold text-ink">Billing</div>

      {notice && <NoticeBanner {...NOTICES[notice]} />}

      {subscribed ? (
        <>
          <div className="mt-4 text-sm text-ink-soft">
            <span className="font-semibold text-ink">{plan.name}</span>
            {tutor.billingInterval && (
              <> · billed {tutor.billingInterval === "year" ? "yearly" : "monthly"}</>
            )}
          </div>
          {tutor.currentPeriodEnd && (
            <p className="mt-1 text-[.86rem] text-muted">
              {tutor.cancelAtPeriodEnd
                ? `Cancelled — you keep ${plan.name} until ${fmtDate(tutor.currentPeriodEnd)}, then move to Free.`
                : paused
                  ? null
                  : `Renews on ${fmtDate(tutor.currentPeriodEnd)}.`}
            </p>
          )}
          {pastDue && (
            <NoticeBanner
              tone="bad"
              text="Your last payment didn't go through. Update your card to keep your plan."
            />
          )}
          {current && (
            <PlanControls
              planId={current}
              planName={plan.name}
              options={options}
              periodEnd={tutor.currentPeriodEnd ? fmtDate(tutor.currentPeriodEnd) : null}
              pendingPlan={
                tutor.pendingPlan && tutor.pendingPlanAt
                  ? { name: PLANS[tutor.pendingPlan].name, at: fmtDate(tutor.pendingPlanAt) }
                  : null
              }
              paused={paused}
              pauseResumes={tutor.pauseResumesAt ? fmtDate(tutor.pauseResumesAt) : null}
              canPause={
                interval === "month" &&
                tutor.subscriptionStatus === "active" &&
                !tutor.cancelAtPeriodEnd
              }
              pauseUntil={fmtDate(pauseEndsAt())}
              rolledOver={rolledOver}
              locked={
                pastDue
                  ? "Update your card before changing plan."
                  : tutor.cancelAtPeriodEnd
                    ? "Your plan is set to cancel. Keep your subscription in Manage billing to change plan."
                    : null
              }
            />
          )}
          <a
            href="/dashboard/billing/portal"
            className="mt-5 inline-flex rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 uppercase tracking-[.1em] hover:bg-cocoa-lift"
          >
            {pastDue ? "Update payment method" : "Manage billing"}
          </a>
          <p className="mt-2 text-[.8rem] text-muted">
            Update your card, switch between monthly and yearly, download invoices or cancel.
          </p>
        </>
      ) : plan.id === "legacy" ? (
        <p className="mt-2 text-sm text-ink-soft">
          You&apos;re on early access, so there&apos;s nothing to pay. Thanks for being here early.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            Pick a plan to keep recording lessons. Yearly billing gets you 2 months free.
          </p>
          <ul className="mt-4 grid gap-2.5">
            {PAID_PLAN_IDS.map((id) => (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/60 px-4 py-3"
              >
                <div>
                  <div className="font-semibold text-ink">{PLANS[id].name}</div>
                  <div className="text-[.82rem] text-muted">
                    {PLANS[id].lessons} lessons a month
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/dashboard/billing/checkout?plan=${id}&interval=month`}
                    className="rounded-lg border border-brand-line bg-white px-3 py-1.5 text-[.84rem] font-semibold text-ink transition-colors hover:border-brand"
                  >
                    ${formatUsd(PLAN_PRICES_USD[id].month)}/mo
                  </a>
                  <a
                    href={`/dashboard/billing/checkout?plan=${id}&interval=year`}
                    className="rounded-full bg-cocoa px-3 py-1.5 text-[.84rem] font-semibold text-butter transition-all hover:-translate-y-0.5 uppercase tracking-[.1em] hover:bg-cocoa-lift"
                  >
                    ${formatUsd(PLAN_PRICES_USD[id].year)}/yr
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {tutor.stripeCustomerId && (
            <a
              href="/dashboard/billing/portal"
              className="mt-3 inline-block text-[.84rem] text-brand-deep hover:underline"
            >
              View past invoices
            </a>
          )}
        </>
      )}
    </div>
  );
}

function NoticeBanner({ tone, text }: { tone: "good" | "info" | "bad"; text: string }) {
  const styles = {
    good: "border-[#bfe3c6] bg-[#eef8f0] text-[#2e6b3a]",
    info: "border-brand-line bg-brand-soft/50 text-ink-soft",
    bad: "border-[#f1c4c2] bg-[#fdf0ef] text-[#a8403c]",
  }[tone];
  return (
    <div role="status" className={`mt-3 rounded-xl border px-4 py-2.5 text-sm ${styles}`}>
      {text}
    </div>
  );
}
