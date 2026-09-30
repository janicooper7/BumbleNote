// The spend report is sums over `usage_events` within UK days, plus a share of
// the fixed plans. Run against real Postgres (PGlite), since the grouping and the
// day boundaries are the SQL itself.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

import { migrate, pg } from "@/test/pglite-neon";
import { claudeCostUsd, recordClaudeUsage, recordDeepgramUsage, recordEmailSent } from "./usage";
import { buildUsageReport, dayPeriod, fixedMonthlyCosts, monthPeriod } from "./usage-report";

const at = (iso: string) => pg.query(`update usage_events set occurred_at = '${iso}' where occurred_at > now() - interval '1 minute'`);

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  await pg.query("delete from usage_events");
  // No live vendor lookups from tests: empty keys read as "not configured".
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("DEEPGRAM_BILLING_API_KEY", "");
  vi.stubEnv("NEON_API_KEY", "");
  vi.stubEnv("FIXED_MONTHLY_COSTS", "Netlify=19, Neon=5, Resend=20");
});

describe("pricing", () => {
  it("prices Claude tokens per million, including cache", () => {
    expect(
      claudeCostUsd("claude-sonnet-5", {
        input_tokens: 1_000_000,
        output_tokens: 100_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1_000_000,
      }),
    ).toBeCloseTo(2 + 1 + 0.2);
  });

  it("returns null for a model it has no price for, rather than zero", () => {
    expect(claudeCostUsd("claude-unknown", { input_tokens: 1, output_tokens: 1 })).toBeNull();
  });

  it("parses FIXED_MONTHLY_COSTS and skips junk", () => {
    expect(fixedMonthlyCosts("Netlify=19, Neon = 5,bad,Resend=x")).toEqual({ Netlify: 19, Neon: 5 });
  });
});

describe("buildUsageReport", () => {
  it("sums one UK day and adds that day's share of the fixed plans", async () => {
    await recordClaudeUsage("lesson-feedback", "claude-sonnet-5", { input_tokens: 20_000, output_tokens: 3_000 });
    await recordDeepgramUsage("transcribe", "nova-3", 1200); // 20 min
    await recordEmailSent("lesson-report");
    await at("2026-10-05T12:00:00Z");

    const report = await buildUsageReport(dayPeriod(2026, 9, 5));
    const headline = Object.fromEntries(report.headline);

    const claude = (20_000 * 2 + 3_000 * 10) / 1e6; // $0.07
    const deepgram = 20 * 0.004335; // $0.0867
    expect(headline["Metered (Claude + Deepgram)"]).toBe(`$${(claude + deepgram).toFixed(4)}`);
    expect(headline["Fixed plans (today's share)"]).toBe(`$${(44 / 31).toFixed(2)}`);
    expect(report.sections.find((s) => s.title.startsWith("Resend"))?.title).toBe("Resend — 1 email(s)");
  });

  it("counts by the UK day, not the UTC one, across the October clock change", async () => {
    // 23:30 UTC on 24 Oct is 00:30 BST on 25 Oct: it belongs to the 25th.
    await recordEmailSent("alert");
    await at("2026-10-24T23:30:00Z");
    // 23:30 UTC on 25 Oct is 23:30 GMT, clocks having gone back: still the 25th.
    await recordEmailSent("alert");
    await at("2026-10-25T23:30:00Z");

    const report = await buildUsageReport(dayPeriod(2026, 9, 25));
    expect(report.sections.find((s) => s.title.startsWith("Resend"))?.title).toBe("Resend — 2 email(s)");
    const before = await buildUsageReport(dayPeriod(2026, 9, 24));
    expect(before.sections.find((s) => s.title.startsWith("Resend"))?.title).toBe("Resend — 0 email(s)");
  });

  it("carries the whole fixed cost in a monthly report", async () => {
    const report = await buildUsageReport(monthPeriod(2026, 9));
    expect(report.heading).toBe("Monthly spend — October 2026");
    expect(Object.fromEntries(report.headline)["Fixed plans"]).toBe("$44.00");
  });

  it("warns when a Claude call couldn't be priced", async () => {
    await recordClaudeUsage("lesson-feedback", "claude-unknown", { input_tokens: 10, output_tokens: 10 });
    await at("2026-10-05T12:00:00Z");
    const report = await buildUsageReport(dayPeriod(2026, 9, 5));
    expect(report.warnings.join(" ")).toMatch(/no price/);
  });
});
