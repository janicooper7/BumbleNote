// Settings → Plan & usage: extra lesson packs (src/lib/lesson-packs.ts). What's
// left from packs already bought, and links to buy another. Plain <a>, not
// <Link>, for the same reason as BillingCard: each link opens a Stripe Checkout,
// and a prefetch would create sessions nobody asked for.

import { formatUsd, LESSON_PACKS } from "@/lib/pricing";
import { PACK_VALID_MONTHS } from "@/lib/lesson-packs";

const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export default function ExtraLessons({
  extraLessons,
  extraExpiresAt,
  canBuy,
}: {
  extraLessons: number;
  extraExpiresAt: Date | null;
  /** A live subscription that isn't set to cancel: packs only count while subscribed. */
  canBuy: boolean;
}) {
  if (!canBuy && extraLessons === 0) return null;

  return (
    <div id="extra-lessons" className="mt-6 scroll-mt-24 rounded-xl border border-line bg-white/60 px-4 py-4">
      <div className="text-base font-semibold text-ink">Extra lessons</div>
      {extraLessons > 0 ? (
        <p className="mt-1 text-sm text-ink-soft">
          <span className="font-semibold text-ink">{extraLessons}</span> extra{" "}
          {extraLessons === 1 ? "lesson" : "lessons"} left
          {extraExpiresAt && <>, the next of them expiring on {fmtDay(extraExpiresAt)}</>}. They&apos;re used
          once your plan&apos;s lessons for the month run out.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          A busy month? Top up with a pack. It&apos;s used once your plan&apos;s lessons run out, and
          lasts {PACK_VALID_MONTHS} months.
        </p>
      )}

      {canBuy && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {LESSON_PACKS.map((pack) => (
              <a
                key={pack.lessons}
                href={`/dashboard/billing/lessons?pack=${pack.lessons}`}
                className="rounded-lg border border-brand-line bg-white px-3 py-2 text-center transition-colors hover:border-brand"
              >
                <span className="block text-sm font-semibold text-ink">{pack.lessons} lessons</span>
                <span className="block text-sm text-muted">${formatUsd(pack.usd)}</span>
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            One-off payment, no change to your plan. Running out every month? Upgrading works out cheaper.
          </p>
        </>
      )}
    </div>
  );
}
