"use client";

// Settings → Billing, for a live subscriber: switch plan, and pause for a month.
// Every button that touches billing asks once more inline (never a browser
// dialog) and says what will be charged and when. Everything shown is resolved
// on the server by BillingCard; the actions re-check it all against Stripe.

import { useState, useTransition } from "react";
import {
  changePlan,
  pauseSubscription,
  resumeSubscription,
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
  paused,
  pauseResumes,
  canPause,
  pauseUntil,
  rolledOver,
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
  pendingPlan: { name: string; at: string } | null;
  paused: boolean;
  pauseResumes: string | null;
  canPause: boolean;
  /** When a pause started now would end. */
  pauseUntil: string;
  /** Lessons carried into this month — what stays usable while paused. */
  rolledOver: number;
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
      {paused && (
        <div className="rounded-xl border border-brand-line bg-brand-soft/50 px-4 py-3 text-sm text-ink-soft">
          <div className="font-semibold text-ink">
            Paused{pauseResumes ? ` until ${pauseResumes}` : ""}
          </div>
          <p className="mt-1">
            You won&apos;t be charged while paused, and no new lessons are added for this month.
            Lessons you carried over are still yours to use. Billing picks up again by itself.
          </p>
          <button
            onClick={() => act(resumeSubscription)}
            disabled={busy}
            className="mt-3 rounded-lg border border-brand-line bg-white px-3 py-1.5 text-[.84rem] font-semibold text-ink transition-colors hover:border-brand disabled:opacity-60"
          >
            {busy ? "Resuming…" : "Resume now"}
          </button>
        </div>
      )}

      {pendingPlan && (
        <div className="rounded-xl border border-brand-line bg-brand-soft/50 px-4 py-3 text-sm text-ink-soft">
          Switching to <span className="font-semibold text-ink">{pendingPlan.name}</span> on{" "}
          {pendingPlan.at}. You keep {planName} until then.
          <button
            onClick={() => act(() => changePlan(planId))}
            disabled={busy}
            className="ml-2 font-semibold text-brand-deep hover:underline disabled:opacity-60"
          >
            Keep {planName}
          </button>
        </div>
      )}

      <div>
        <div className="text-[.84rem] font-semibold text-ink">Change plan</div>
        {locked ? (
          <p className="mt-1 text-[.82rem] text-muted">{locked}</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {options.map((o) => {
                const open = confirming?.kind === "plan" && confirming.plan.id === o.id;
                return (
                  <li key={o.id} className="rounded-xl border border-line bg-white/60 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-ink">{o.name}</div>
                        <div className="text-[.82rem] text-muted">
                          {o.lessons} lessons a month · {o.price}
                        </div>
                      </div>
                      {!open && (
                        <button
                          onClick={() => {
                            setError(null);
                            setConfirming({ kind: "plan", plan: o });
                          }}
                          disabled={busy}
                          className={
                            o.direction === "up"
                              ? "rounded-full bg-cocoa px-3 py-1.5 text-[.84rem] font-semibold uppercase tracking-[.1em] text-butter transition-all hover:-translate-y-0.5 hover:bg-cocoa-lift"
                              : "rounded-lg border border-brand-line bg-white px-3 py-1.5 text-[.84rem] font-semibold text-ink transition-colors hover:border-brand"
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

      {canPause && !paused && (
        <div>
          <div className="text-[.84rem] font-semibold text-ink">Taking a break?</div>
          {confirming?.kind === "pause" ? (
            <Confirm
              text={
                `Your plan pauses until ${pauseUntil}, then carries on by itself. You won't be charged ` +
                `for that month and no new lessons are added for it. Lessons you already have stay ` +
                `usable${rolledOver > 0 ? ` (including ${rolledOver} carried over)` : ""}, and up to your ` +
                `plan's rollover limit carries through the pause.`
              }
              confirmLabel="Pause for a month"
              busy={busy}
              onConfirm={() => act(pauseSubscription)}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <>
              <p className="mt-1 text-[.82rem] text-muted">
                Pause your plan for one month without cancelling. Billing resumes automatically.
              </p>
              <button
                onClick={() => {
                  setError(null);
                  setConfirming({ kind: "pause" });
                }}
                disabled={busy}
                className="mt-2 rounded-lg border border-brand-line bg-white px-3 py-1.5 text-[.84rem] font-semibold text-ink transition-colors hover:border-brand"
              >
                Pause for a month
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#f1c4c2] bg-[#fdf0ef] px-4 py-2.5 text-sm text-[#a8403c]"
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
      <p className="text-[.84rem] text-ink-soft">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-cocoa px-3 py-1.5 text-[.84rem] font-semibold uppercase tracking-[.1em] text-butter transition-all hover:bg-cocoa-lift disabled:opacity-60"
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-[.84rem] font-semibold text-ink-soft transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
