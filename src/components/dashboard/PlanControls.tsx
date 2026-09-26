"use client";

// Settings → Billing, for a live subscriber: switch plan, and pause for a month.
// Every button that touches billing asks once more inline (never a browser
// dialog) and says what will be charged and when. Everything shown is resolved
// on the server by BillingCard; the actions re-check it all against Stripe.

import { useState, useTransition } from "react";
import {
  changePlan,
  cancelPause,
  pauseSubscription,
  type BillingActionResult,
} from "@/app/actions/billing";

export type PlanOption = {
  id: string;
  name: string;
  lessons: number;
  /** "$39.99/mo" */
  price: string;
  direction: "up" | "down";
};

type Pending = { kind: "plan"; plan: PlanOption } | { kind: "pause" } | null;

export default function PlanControls({
  planId,
  planName,
  options,
  periodEnd,
  pendingPlan,
  pause,
  nextPause,
  canPause,
  rolloverCap,
  lessonsLeft,
  locked,
}: {
  planId: string;
  planName: string;
  /** The other paid plans, on the tutor's billing interval. */
  options: PlanOption[];
  /** When a downgrade would take effect, e.g. "20 October 2026". */
  periodEnd: string | null;
  /** A downgrade already queued for renewal. */
  pendingPlan: { id: string; name: string; at: string } | null;
  /** A pause scheduled or running: the billing month it skips. */
  pause: { from: string; until: string; started: boolean } | null;
  /** The billing month a pause started now would skip. */
  nextPause: { from: string; until: string } | null;
  canPause: boolean;
  /** Most unused lessons the plan carries into the next month. */
  rolloverCap: number;
  /** Lessons left this month, which an upgrade keeps. */
  lessonsLeft: number;
  /** Why plan changes are unavailable right now (cancelling, card declined). */
  locked: string | null;
}) {
  const [confirming, setConfirming] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function act(work: () => Promise<BillingActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) setConfirming(null);
      else setError(result.error);
    });
  }

  return (
    <div className="mt-5 grid gap-4">
      {pause && (
        <div className="rounded-xl border border-brand-line bg-brand-soft/50 px-4 py-3 text-base text-ink-soft">
          <div className="font-semibold text-ink">
            {pause.started ? `Paused until ${pause.until}` : `Pause scheduled from ${pause.from}`}
          </div>
          <p className="mt-1">
            {pause.started
              ? `You're not charged for this month and no new lessons are added for it. Lessons you have left are still yours to use. Billing and your lessons pick up again on ${pause.until} by themselves.`
              : `You keep your plan as normal until then. You won't be charged on ${pause.from} and no new lessons are added for the month to ${pause.until}; lessons you have left stay usable. Billing and your lessons pick up again on ${pause.until} by themselves.`}
          </p>
          {!pause.started && (
            <button
              onClick={() => act(cancelPause)}
              disabled={busy}
              className="mt-3 rounded-lg border border-brand-line bg-white px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
            >
              {busy ? "Cancelling…" : "Cancel the pause"}
            </button>
          )}
        </div>
      )}

      {pendingPlan && (
        <div className="rounded-xl border border-brand-line bg-brand-soft/50 px-4 py-3 text-base text-ink-soft">
          <div className="font-semibold text-ink">
            Downgrade to {pendingPlan.name} on {pendingPlan.at}
          </div>
          <p className="mt-1">
            You&apos;ve paid for {planName} until then, so you keep it and its lessons. From{" "}
            {pendingPlan.at} you&apos;ll be on {pendingPlan.name}.
          </p>
          <button
            onClick={() => act(() => changePlan(planId))}
            disabled={busy}
            className="mt-2 font-semibold text-brand-deep hover:underline disabled:opacity-60"
          >
            Cancel the downgrade and keep {planName}
          </button>
        </div>
      )}

      <div>
        <div className="text-sm font-semibold text-ink">Change plan</div>
        {locked ? (
          <p className="mt-1 text-sm text-muted">{locked}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {options.map((o) => {
                const open = confirming?.kind === "plan" && confirming.plan.id === o.id;
                return (
                  <li key={o.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-ink">{o.name}</div>
                        <div className="text-sm text-muted">
                          {o.lessons} lessons a month · {o.price}
                        </div>
                      </div>
                      {pendingPlan?.id === o.id ? (
                        <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-ink-soft">
                          From {pendingPlan.at}
                        </span>
                      ) : !open && (
                        <button
                          onClick={() => {
                            setError(null);
                            setConfirming({ kind: "plan", plan: o });
                          }}
                          disabled={busy}
                          className={
                            o.direction === "up"
                              ? "rounded-full bg-cocoa px-3 py-1.5 text-sm font-semibold uppercase tracking-[.1em] text-butter transition-all hover:-translate-y-0.5 hover:bg-cocoa-lift"
                              : "rounded-lg border border-brand-line bg-white px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-brand"
                          }
                        >
                          {o.direction === "up" ? "Upgrade" : "Downgrade"}
                        </button>
                      )}
                    </div>
                    {open && (
                      <Confirm
                        text={
                          o.direction === "up"
                            ? `Your billing restarts today: you'll pay ${o.price} for ${o.name} now, minus credit for the unused part of ${planName}, and renew on this date from then on. ` +
                              `You keep the ${lessonsLeft} ${lessonsLeft === 1 ? "lesson" : "lessons"} you have left and get ${o.lessons} more straight away — ` +
                              `${lessonsLeft + o.lessons} to use now.`
                            : `You'll move to ${o.name} on ${periodEnd ?? "your next renewal"} and pay ${o.price} from then. You keep ${planName} until that date.`
                        }
                        confirmLabel={o.direction === "up" ? `Upgrade to ${o.name}` : `Downgrade to ${o.name}`}
                        busy={busy}
                        onConfirm={() => act(() => changePlan(o.id))}
                        onCancel={() => setConfirming(null)}
                      />
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {canPause && nextPause && (
        <div>
          <div className="text-sm font-semibold text-ink">Taking a break?</div>
          {pendingPlan ? (
            <p className="mt-1 text-sm text-muted">
              You can pause once your switch to {pendingPlan.name} has happened, or cancel the
              downgrade above to pause sooner.
            </p>
          ) : confirming?.kind === "pause" ? (
            <Confirm
              text={
                `You keep this month as normal. Your plan then pauses from ${nextPause.from} to ` +
                `${nextPause.until}: you won't be charged on ${nextPause.from} and no new lessons are ` +
                `added for that month. Up to ${rolloverCap} unused lessons carry into it and stay usable. ` +
                `Billing and your lessons pick up again on ${nextPause.until} by themselves.`
              }
              confirmLabel="Pause next month"
              busy={busy}
              onConfirm={() => act(pauseSubscription)}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Skip your next billing month, {nextPause.from} to {nextPause.until}, without
                cancelling. Billing resumes automatically.
              </p>
              <button
                onClick={() => {
                  setError(null);
                  setConfirming({ kind: "pause" });
                }}
                disabled={busy}
                className="mt-2 rounded-lg border border-brand-line bg-white px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-brand"
              >
                Pause next month
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#f1c4c2] bg-[#fdf0ef] px-4 py-2.5 text-base text-[#a8403c]"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function Confirm({
  text,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-brand-line bg-white/80 p-3">
      <p className="text-sm text-ink-soft">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-cocoa px-3 py-1.5 text-sm font-semibold uppercase tracking-[.1em] text-butter transition-all hover:bg-cocoa-lift disabled:opacity-60"
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
