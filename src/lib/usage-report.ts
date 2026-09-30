// The daily and monthly spend report: what each vendor cost us over a period,
// what the product did with it, and anything running low. Sent by the scheduled
// function netlify/functions/usage-report.mts; previewable with
// scripts/usage-report.ts.
//
// Three kinds of number, kept apart because they're not equally trustworthy:
//   - Metered spend (Claude, Deepgram) — summed from `usage_events`, priced from
//     each call's real usage at list price (src/lib/usage.ts). An estimate, but a
//     close one; the vendors' own invoices remain the source of truth.
//   - Fixed spend — the plans we pay for (Netlify, Neon, Resend, …), from
//     FIXED_MONTHLY_COSTS, spread evenly over the month's days.
//   - Live readings — balances and plan usage pulled from vendor APIs at send
//     time. Best-effort: a vendor that can't be read is reported as such, never
//     as zero.
//
// Days are UK days (Europe/London), since that's the business's clock.
//
// No next/* imports: this is bundled into a Netlify function.

import { and, count, gte, lt, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { sessions, tutors, usageEvents, waitlist } from "@/db/schema";

const TZ = "Europe/London";

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type Period = { kind: "day" | "month"; label: string; from: Date; to: Date };

/** Minutes London is ahead of UTC at `at` (0 in winter, 60 in summer). */
function londonOffsetMin(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * The instant London's calendar day `y-m-d` begins. `m` is 0-based and may
 * overflow (Date.UTC normalises it). The clocks change at 01:00 UTC, so the
 * offset read at UTC midnight is already the one in force at London midnight.
 */
function londonMidnight(y: number, m: number, d: number): Date {
  const utcMidnight = Date.UTC(y, m, d);
  return new Date(utcMidnight - londonOffsetMin(new Date(utcMidnight)) * 60_000);
}

/** Today's date in London as numbers, `m` 0-based. */
export function londonToday(now = new Date()): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now).split("-").map(Number);
  return { y, m: m - 1, d };
}

export function dayPeriod(y: number, m: number, d: number): Period {
  const from = londonMidnight(y, m, d);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(from);
  return { kind: "day", label, from, to: londonMidnight(y, m, d + 1) };
}

export function monthPeriod(y: number, m: number): Period {
  const from = londonMidnight(y, m, 1);
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, month: "long", year: "numeric" }).format(from);
  return { kind: "month", label, from, to: londonMidnight(y, m + 1, 1) };
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * FIXED_MONTHLY_COSTS="Netlify=19, Neon=5, Resend=20" — USD per month for every
 * plan with a flat fee. Update it whenever a plan changes; it's the only part of
 * the report that can't be measured.
 */
export function fixedMonthlyCosts(raw = process.env.FIXED_MONTHLY_COSTS ?? ""): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [name, value] = part.split("=").map((s) => s?.trim());
    const usd = Number(value);
    if (name && Number.isFinite(usd)) out[name] = usd;
  }
  return out;
}

function numberEnv(name: string): number | undefined {
  const v = Number(process.env[name]);
  return process.env[name] && Number.isFinite(v) ? v : undefined;
}

// ---------------------------------------------------------------------------
// Gathering
// ---------------------------------------------------------------------------

type UsageRow = {
  service: string;
  kind: string;
  calls: number;
  quantity: number;
  costUsd: number;
  unpriced: number;
  inputTokens: number;
};

async function usageBetween(from: Date, to: Date): Promise<UsageRow[]> {
  const rows = await db
    .select({
      service: usageEvents.service,
      kind: usageEvents.kind,
      calls: count(),
      quantity: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::float8`,
      costUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)::float8`,
      unpriced: sql<number>`count(*) filter (where ${usageEvents.costUsd} is null)::int`,
      inputTokens: sql<number>`coalesce(sum((${usageEvents.meta}->>'inputTokens')::float8), 0)::float8`,
    })
    .from(usageEvents)
    .where(and(gte(usageEvents.occurredAt, from), lt(usageEvents.occurredAt, to)))
    .groupBy(usageEvents.service, usageEvents.kind);
  // neon-http hands numerics back as strings in places; normalise once here.
  return rows.map((r) => ({
    ...r,
    calls: Number(r.calls),
    quantity: Number(r.quantity),
    costUsd: Number(r.costUsd),
    unpriced: Number(r.unpriced),
    inputTokens: Number(r.inputTokens),
  }));
}

async function countCreated(
  table: typeof tutors | typeof waitlist,
  from: Date,
  to: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(and(gte(table.createdAt, from), lt(table.createdAt, to)));
  return Number(row?.n ?? 0);
}

/** Lessons the pipeline turned into notes: how many, how long, by how many tutors. */
async function lessonsBetween(from: Date, to: Date): Promise<{ lessons: number; minutes: number; tutors: number }> {
  const [row] = await db
    .select({
      lessons: count(),
      minutes: sql<number>`coalesce(sum(${sessions.durationMin}), 0)::int`,
      tutors: sql<number>`count(distinct ${sessions.tutorId})::int`,
    })
    .from(sessions)
    .where(and(gte(sessions.createdAt, from), lt(sessions.createdAt, to)));
  return { lessons: Number(row?.lessons ?? 0), minutes: Number(row?.minutes ?? 0), tutors: Number(row?.tutors ?? 0) };
}

type StripeTotals = { currency: string; payments: number; gross: number; fees: number; refunds: number };

/** Money in and Stripe's cut, per currency, from the balance ledger. */
async function stripeBetween(from: Date, to: Date): Promise<StripeTotals[] | string> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "not configured";
  try {
    const stripe = new Stripe(key);
    const txns = await stripe.balanceTransactions
      .list({ created: { gte: Math.floor(from.getTime() / 1000), lt: Math.floor(to.getTime() / 1000) }, limit: 100 })
      .autoPagingToArray({ limit: 5000 });
    const byCurrency = new Map<string, StripeTotals>();
    for (const t of txns) {
      const c = byCurrency.get(t.currency) ?? { currency: t.currency, payments: 0, gross: 0, fees: 0, refunds: 0 };
      if (t.type === "charge" || t.type === "payment") {
        c.payments++;
        c.gross += t.amount;
      } else if (t.type === "refund" || t.type === "payment_refund") {
        c.refunds += -t.amount;
      }
      c.fees += t.fee;
      byCurrency.set(t.currency, c);
    }
    return [...byCurrency.values()];
  } catch (err) {
    return `unavailable (${err instanceof Error ? err.message : String(err)})`;
  }
}

/**
 * Deepgram's billing API. Reading usage and balances needs a key with the
 * `usage:read` scope (an Admin-role key), which the app's transcription key
 * deliberately lacks — so it's a separate DEEPGRAM_BILLING_API_KEY, used only here.
 */
function deepgramBilling() {
  const key = process.env.DEEPGRAM_BILLING_API_KEY;
  if (!key) return null;
  const get = async (path: string) => {
    const res = await fetch(`https://api.deepgram.com/v1${path}`, { headers: { Authorization: `Token ${key}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path.split("?")[0]}`);
    return res.json();
  };
  const projectIds = async () =>
    ((await get("/projects")) as { projects: { project_id: string }[] }).projects.map((p) => p.project_id);
  return { get, projectIds };
}

const unavailable = (err: unknown) => `unavailable (${err instanceof Error ? err.message : String(err)})`;

/** Remaining prepaid Deepgram credit, summed over the key's projects. */
async function deepgramBalance(): Promise<number | string> {
  const api = deepgramBilling();
  if (!api) return "not configured (set DEEPGRAM_BILLING_API_KEY)";
  try {
    let total = 0;
    for (const id of await api.projectIds()) {
      const { balances } = (await api.get(`/projects/${id}/balances`)) as { balances: { amount: number }[] };
      total += balances.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    }
    return total;
  } catch (err) {
    return unavailable(err);
  }
}

/** Hard stop on paging: 5,000 requests is ~2,500 lessons, far past a month today. */
const DEEPGRAM_MAX_PAGES = 50;

/**
 * What Deepgram actually charged over a period, from its per-request log — exact,
 * unlike our own estimate, which it replaces in the report whenever it's readable.
 */
async function deepgramCharged(from: Date, to: Date): Promise<{ usd: number; minutes: number; requests: number } | string> {
  const api = deepgramBilling();
  if (!api) return "not configured";
  try {
    const totals = { usd: 0, minutes: 0, requests: 0 };
    const range = `start=${from.toISOString()}&end=${to.toISOString()}`;
    for (const id of await api.projectIds()) {
      for (let page = 0; ; page++) {
        if (page === DEEPGRAM_MAX_PAGES) throw new Error("too many requests to page through");
        const { requests } = (await api.get(`/projects/${id}/requests?${range}&limit=100&page=${page}`)) as {
          requests: { created: string; response?: { details?: { usd?: number; duration?: number } } }[];
        };
        for (const r of requests) {
          // The API's own range filter is trusted, but not blindly: a boundary
          // off by a timezone would silently double-count across days.
          const at = new Date(r.created);
          if (at < from || at >= to) continue;
          totals.usd += Number(r.response?.details?.usd ?? 0);
          totals.minutes += Number(r.response?.details?.duration ?? 0) / 60;
          totals.requests++;
        }
        if (requests.length < 100) break;
      }
    }
    return totals;
  } catch (err) {
    return unavailable(err);
  }
}

/**
 * Neon compute used in the current billing period — the number that suspends the
 * database on the free plan when it runs out. Needs NEON_API_KEY and
 * NEON_PROJECT_ID (console.neon.tech → Account → API keys; project id from the
 * project's Settings page).
 */
async function neonCompute(): Promise<{ computeHours: number; since: string } | string> {
  const key = process.env.NEON_API_KEY;
  const project = process.env.NEON_PROJECT_ID;
  if (!key || !project) return "not configured";
  try {
    const res = await fetch(`https://console.neon.tech/api/v2/projects/${project}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { project: p } = (await res.json()) as {
      project: { compute_time_seconds?: number; consumption_period_start?: string };
    };
    if (typeof p.compute_time_seconds !== "number") throw new Error("no compute_time_seconds in response");
    return { computeHours: p.compute_time_seconds / 3600, since: p.consumption_period_start ?? "" };
  } catch (err) {
    return `unavailable (${err instanceof Error ? err.message : String(err)})`;
  }
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export type ReportSection = { title: string; rows: [string, string][] };

export type UsageReport = {
  subject: string;
  heading: string;
  headline: [string, string][];
  warnings: string[];
  sections: ReportSection[];
};

const usd = (n: number) => `$${n < 1 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
const int = (n: number) => Math.round(n).toLocaleString("en-GB");
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);

function sumCost(rows: UsageRow[], service?: string): number {
  return rows.filter((r) => !service || r.service === service).reduce((s, r) => s + r.costUsd, 0);
}

export async function buildUsageReport(period: Period): Promise<UsageReport> {
  const { from, to } = period;
  const start = londonToday(from);
  const monthStart = londonMidnight(start.y, start.m, 1);
  const days = daysIn(start.y, start.m);
  const isDay = period.kind === "day";

  const [usage, monthUsage, taught, newTutors, joins, stripeTotals, dgBalance, dgCharged, dgMonth, neon] = await Promise.all([
    usageBetween(from, to),
    isDay ? usageBetween(monthStart, to) : Promise.resolve(null),
    lessonsBetween(from, to),
    countCreated(tutors, from, to),
    countCreated(waitlist, from, to),
    stripeBetween(from, to),
    deepgramBalance(),
    deepgramCharged(from, to),
    isDay ? deepgramCharged(monthStart, to) : Promise.resolve(null),
    neonCompute(),
  ]);

  const lessons = taught.lessons;
  const claude = usage.filter((r) => r.service === "anthropic");
  const deepgram = usage.filter((r) => r.service === "deepgram");
  const emails = usage.filter((r) => r.service === "resend");

  const claudeUsd = sumCost(usage, "anthropic");
  // Deepgram's own bill when we can read it; our estimate otherwise.
  const deepgramUsd = typeof dgCharged === "string" ? sumCost(usage, "deepgram") : dgCharged.usd;
  const meteredUsd = claudeUsd + deepgramUsd;

  const fixed = fixedMonthlyCosts();
  const fixedMonthUsd = Object.values(fixed).reduce((s, v) => s + v, 0);
  // A day carries its share of the month's plans; a month carries all of it.
  const fixedUsd = isDay ? fixedMonthUsd / days : fixedMonthUsd;
  const totalUsd = meteredUsd + fixedUsd;

  const emailCount = emails.reduce((s, r) => s + r.calls, 0);
  const warnings: string[] = [];

  // --- Headline --------------------------------------------------------------
  const headline: [string, string][] = [
    ["Total spend", usd(totalUsd)],
    ["Metered (Claude + Deepgram)", usd(meteredUsd)],
    [isDay ? "Fixed plans (today's share)" : "Fixed plans", usd(fixedUsd)],
    ["Lessons taught", int(lessons)],
    ["Metered cost per lesson", lessons ? usd(meteredUsd / lessons) : "—"],
  ];
  if (monthUsage) {
    const elapsed = start.d;
    const monthDeepgram =
      dgMonth && typeof dgMonth !== "string" ? dgMonth.usd : sumCost(monthUsage, "deepgram");
    headline.push([
      "Month to date",
      usd(sumCost(monthUsage, "anthropic") + monthDeepgram + (fixedMonthUsd * elapsed) / days),
    ]);
  }

  // --- Per service -----------------------------------------------------------
  const sections: ReportSection[] = [];

  // Every lesson makes at least one Claude call, so fewer calls than lessons means
  // the ledger is missing rows (a deploy without tracking, or inserts failing).
  const feedbackCalls = claude.find((r) => r.kind === "lesson-feedback")?.calls ?? 0;
  if (lessons > feedbackCalls) {
    warnings.push(
      `${lessons - feedbackCalls} of ${lessons} lesson(s) have no recorded Claude usage, so metered spend is understated. ` +
        `Check the function logs for "[usage] could not record".`,
    );
  }

  const unpriced = claude.reduce((s, r) => s + r.unpriced, 0);
  if (unpriced) warnings.push(`${unpriced} Claude call(s) used a model with no price in src/lib/usage.ts — spend is understated.`);
  sections.push({
    title: `Anthropic (Claude) — ${usd(claudeUsd)}`,
    rows: claude.length
      ? claude.map((r) => [
          r.kind,
          `${int(r.calls)} call(s) · ${int(r.inputTokens)} in / ${int(r.quantity)} out tokens · ${usd(r.costUsd)}`,
        ])
      : [["Calls", "none"]],
  });
  sections[sections.length - 1].rows.push([
    "Credit balance",
    "not readable by API — keep auto-reload on (console.anthropic.com → Billing)",
  ]);

  const dgMinutes = deepgram.reduce((s, r) => s + r.quantity, 0) / 60;
  const estimatedDeepgram = sumCost(usage, "deepgram");
  sections.push({
    title: `Deepgram — ${usd(deepgramUsd)}`,
    rows:
      typeof dgCharged === "string"
        ? [
            ["Audio transcribed", `${dgMinutes.toFixed(1)} min over ${int(deepgram.reduce((s, r) => s + r.calls, 0))} track(s)`],
            ["Spend", `estimated — Deepgram's bill ${dgCharged}`],
            ["Balance left", typeof dgBalance === "number" ? usd(dgBalance) : dgBalance],
          ]
        : [
            ["Audio billed", `${dgCharged.minutes.toFixed(1)} min over ${int(dgCharged.requests)} request(s)`],
            ["Spend", `${usd(dgCharged.usd)} as billed by Deepgram (our estimate ${usd(estimatedDeepgram)})`],
            ["Balance left", typeof dgBalance === "number" ? usd(dgBalance) : dgBalance],
          ],
  });
  const dgLow = numberEnv("DEEPGRAM_LOW_BALANCE_USD") ?? 25;
  if (typeof dgBalance === "number" && dgBalance < dgLow) {
    warnings.push(`Deepgram balance is ${usd(dgBalance)} (under ${usd(dgLow)}). Transcription stops at zero — top up or enable auto-recharge.`);
  }

  const resendDaily = numberEnv("RESEND_DAILY_LIMIT");
  const resendMonthly = numberEnv("RESEND_MONTHLY_LIMIT");
  const monthEmails = monthUsage?.filter((r) => r.service === "resend").reduce((s, r) => s + r.calls, 0);
  sections.push({
    title: `Resend — ${int(emailCount)} email(s)`,
    rows: [
      ...(emails.length ? emails.map((r): [string, string] => [r.kind, int(r.calls)]) : [["Sent", "none"] as [string, string]]),
      ...(monthEmails !== undefined ? [["Month to date", int(monthEmails)] as [string, string]] : []),
    ],
  });
  if (isDay && resendDaily && emailCount >= resendDaily * 0.8) {
    warnings.push(`Resend: ${emailCount} emails in a day against a ${resendDaily}/day limit. Alerts go through Resend too.`);
  }
  const monthlyCount = isDay ? monthEmails : emailCount;
  if (resendMonthly && monthlyCount !== undefined && monthlyCount >= resendMonthly * 0.8) {
    warnings.push(`Resend: ${monthlyCount} emails this month against a ${resendMonthly}/month limit.`);
  }

  if (typeof neon === "string") {
    sections.push({ title: "Neon (database)", rows: [["Compute this billing period", neon]] });
  } else {
    const limit = numberEnv("NEON_COMPUTE_HOURS_LIMIT");
    sections.push({
      title: "Neon (database)",
      rows: [
        [
          "Compute this billing period",
          `${neon.computeHours.toFixed(1)} h${limit ? ` of ${limit} h` : ""}${neon.since ? ` (since ${neon.since.slice(0, 10)})` : ""}`,
        ],
      ],
    });
    if (limit && neon.computeHours >= limit * 0.75) {
      warnings.push(`Neon compute at ${neon.computeHours.toFixed(1)} of ${limit} hours. The database suspends at the limit on the free plan.`);
    }
  }

  sections.push({
    title: `Fixed plans — ${usd(fixedMonthUsd)}/month`,
    rows: Object.keys(fixed).length
      ? Object.entries(fixed).map(([name, v]): [string, string] => [name, `${usd(v)}/month`])
      : [["None configured", "set FIXED_MONTHLY_COSTS, e.g. Netlify=19, Neon=5, Resend=20"]],
  });

  if (typeof stripeTotals === "string") {
    sections.push({ title: "Stripe", rows: [["Payments", stripeTotals]] });
  } else {
    sections.push({
      title: "Stripe",
      rows: stripeTotals.length
        ? stripeTotals.flatMap((c): [string, string][] => [
            [`Payments (${c.currency.toUpperCase()})`, `${c.payments} · ${money(c.gross, c.currency)} gross`],
            [`Stripe fees (${c.currency.toUpperCase()})`, money(c.fees, c.currency)],
            ...(c.refunds ? [[`Refunds (${c.currency.toUpperCase()})`, money(c.refunds, c.currency)] as [string, string]] : []),
          ])
        : [["Payments", "none"]],
    });
  }

  sections.push({
    title: "Activity",
    rows: [
      ["Lessons taught", int(lessons)],
      ["Hours taught", (taught.minutes / 60).toFixed(1)],
      ["Tutors who taught", int(taught.tutors)],
      ["New tutor accounts", int(newTutors)],
      ["Waitlist joins", int(joins)],
      ["Operator alerts sent", int(emails.find((r) => r.kind === "alert")?.calls ?? 0)],
    ],
  });

  const noun = isDay ? "Daily" : "Monthly";
  return {
    subject: `${noun} spend ${period.label}: ${usd(totalUsd)}${warnings.length ? ` · ${warnings.length} warning(s)` : ""}`,
    heading: `${noun} spend — ${period.label}`,
    headline,
    warnings,
    sections,
  };
}
