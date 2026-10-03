// Operator dashboard: sign-ups, trial use, subscribers and MRR, read straight
// from the database on every load (and re-read every minute while open).
//
// Operators only — the ADMIN_EMAILS allowlist (src/lib/admin.ts). Everyone else,
// signed in or not, gets a plain 404, so the page doesn't admit to existing.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentAdminEmail } from "@/lib/admin";
import { getGrowthStats } from "@/lib/growth-stats";
import { PLANS } from "@/lib/plans";
import AutoRefresh from "./AutoRefresh";

export const metadata: Metadata = {
  title: "Growth",
  robots: { index: false, follow: false },
};

const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default async function GrowthPage() {
  if (!(await currentAdminEmail())) notFound();
  const s = await getGrowthStats();

  const funnel = [
    { name: "Signed up", n: s.signups },
    { name: "Recorded a lesson", n: s.trialStarted },
    { name: "Used full trial", n: s.trialFinished },
    { name: "Subscribed", n: s.subscribed },
  ];
  const peak = Math.max(4, ...s.daily.map((d) => d.n));
  const updated = new Date(s.updatedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

  return (
    <main className="min-h-screen bg-bg text-ink">
      <AutoRefresh seconds={60} />
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold">Growth</h1>
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            Live · updated {updated} UK time
          </p>
        </header>

        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          <Tile label="Signed up" value={s.signups}>
            <b className="text-ink">+{s.signups24h}</b> today · <b className="text-ink">+{s.signups7d}</b> this week
          </Tile>
          <Tile label="Used their trial" value={s.trialStarted}>
            <b className="text-ink">{s.trialFinished}</b> used both lessons
          </Tile>
          <Tile label="Subscribed" value={s.subscribed}>
            <b className="text-ink">{pct(s.subscribed, s.trialStarted)}</b> of trial users
          </Tile>
          <Tile label="Monthly recurring revenue" value={usd(s.mrr)} accent>
            <b className="text-ink">{usd(s.mrr * 12)}</b> a year
          </Tile>
        </section>

        <section>
          <Heading>Funnel</Heading>
          <div className="grid gap-2.5">
            {funnel.map((f, i) => (
              <div key={f.name} className="grid grid-cols-[8rem_minmax(0,1fr)_5.5rem] items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_6rem]">
                <span className="text-sm font-medium">{f.name}</span>
                <span className="h-5 overflow-hidden rounded-md bg-line">
                  <span
                    className={`block h-full min-w-0.5 rounded-md ${i === funnel.length - 1 ? "bg-sky-deep" : "bg-brand"}`}
                    style={{ width: `${(f.n / Math.max(1, s.signups)) * 100}%` }}
                  />
                </span>
                <span className="text-right text-sm tabular-nums">
                  {f.n} <span className="text-muted">{pct(f.n, s.signups)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <Heading>Sign-ups, last 30 days</Heading>
          <div className="flex h-40 items-end gap-1 border-b border-line">
            {s.daily.map((d, i) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.n}`}
                className={`flex-1 rounded-t-sm ${i === s.daily.length - 1 ? "bg-sky-deep" : "bg-brand"}`}
                style={{ height: `${(d.n / peak) * 100}%`, minHeight: d.n ? 3 : 0 }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted tabular-nums">
            <span>{s.daily[0]?.day.slice(5)}</span>
            <span>peak day: {Math.max(0, ...s.daily.map((d) => d.n))}</span>
            <span>today</span>
          </div>
        </section>

        <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0">
            <Heading>Subscribers by plan</Heading>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs uppercase tracking-wider text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 text-left font-semibold">Plan</th>
                    <th className="py-2 text-right font-semibold">Monthly</th>
                    <th className="py-2 text-right font-semibold">Annual</th>
                    <th className="py-2 text-right font-semibold">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byPlan.map((p) => (
                    <tr key={p.plan} className="border-b border-line">
                      <td className="py-2.5">{PLANS[p.plan].name}</td>
                      <td className="py-2.5 text-right">{p.month}</td>
                      <td className="py-2.5 text-right">{p.year}</td>
                      <td className="py-2.5 text-right">{usd(p.mrr)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <td className="py-2.5">Total</td>
                    <td className="py-2.5 text-right">{s.byPlan.reduce((a, p) => a + p.month, 0)}</td>
                    <td className="py-2.5 text-right">{s.byPlan.reduce((a, p) => a + p.year, 0)}</td>
                    <td className="py-2.5 text-right">{usd(s.mrr)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div>
            <Heading>Also worth watching</Heading>
            <dl className="grid gap-2.5 text-sm">
              <Row label="Card failing (past due)" value={s.pastDue} />
              <Row label="Cancelling at period end" value={s.cancelling} />
              <Row label="Annual run rate" value={usd(s.mrr * 12)} />
              <Row label="Waitlist" value={s.waitlist} />
              <Row label="Early-access tutors (not counted above)" value={s.legacy} />
            </dl>
          </div>
        </section>

        <p className="max-w-prose text-xs text-muted">
          Sign-ups are tutor accounts, excluding admin and early-access accounts. &ldquo;Used their trial&rdquo;
          counts tutors who recorded at least one lesson; the free trial is two. Subscribed means an active,
          trialing or past-due Stripe subscription. MRR prices annual plans at a twelfth of the yearly price and
          uses current list prices in USD.
        </p>
      </div>
    </main>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">{children}</h2>;
}

function Tile({
  label,
  value,
  accent,
  children,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1 bg-surface p-5">
      <span className="text-sm text-muted">{label}</span>
      <span className={`font-display text-4xl font-semibold tabular-nums ${accent ? "text-sky-deep" : ""}`}>{value}</span>
      <span className="text-sm text-muted">{children}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-line pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
