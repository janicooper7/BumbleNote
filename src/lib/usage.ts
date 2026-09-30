// Usage ledger: one row in `usage_events` per metered vendor call, priced at the
// moment it happens. The daily and monthly spend reports (src/lib/usage-report.ts)
// add these up; nothing else reads them.
//
// Like alerts.ts, recording NEVER THROWS. A lesson must not fail because the
// bookkeeping about it did — a missing row costs us a slightly low report, a
// thrown error costs a tutor their lesson. It's also safe before migration 0024
// is applied: the insert fails, gets logged, and the caller carries on.
//
// No next/* imports: this is bundled into the Netlify functions.

import { db } from "@/db";
import { usageEvents } from "@/db/schema";

export type UsageService = "anthropic" | "deepgram" | "resend";

/**
 * Claude list prices, USD per million tokens. Thinking tokens are billed as
 * output and already counted in `output_tokens`. Keyed by the exact model id we
 * send (src/lib/ai.ts MODEL); an id missing here is recorded with a null cost
 * and flagged in the report, so switching models can't silently zero the spend.
 */
const CLAUDE_USD_PER_MTOK: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.4 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

/**
 * Deepgram pre-recorded nova-3, USD per audio minute. Read off Deepgram's own
 * per-request billing on 2026-09-30: $0.004335 across 166 requests, the same with
 * and without mip_opt_out. Only a fallback now: when DEEPGRAM_BILLING_API_KEY is
 * set, the report uses what Deepgram actually charged. Override with
 * DEEPGRAM_USD_PER_MIN if the price changes.
 */
const DEEPGRAM_DEFAULT_USD_PER_MIN = 0.004335;

export function deepgramUsdPerMin(): number {
  const override = Number(process.env.DEEPGRAM_USD_PER_MIN);
  return Number.isFinite(override) && override > 0 ? override : DEEPGRAM_DEFAULT_USD_PER_MIN;
}

/** Builds the row inside the try too, so a malformed vendor response can't throw. */
async function record(service: UsageService, kind: string, build: () => Omit<typeof usageEvents.$inferInsert, "service" | "kind">): Promise<void> {
  try {
    await db.insert(usageEvents).values({ service, kind, ...build() });
  } catch (err) {
    console.error(`[usage] could not record ${service}/${kind}:`, err);
  }
}

/** The fields of Anthropic's `response.usage` we price. */
export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function claudeCostUsd(model: string, u: ClaudeUsage): number | null {
  const p = CLAUDE_USD_PER_MTOK[model];
  if (!p) return null;
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000
  );
}

export async function recordClaudeUsage(kind: string, model: string, u: ClaudeUsage): Promise<void> {
  await record("anthropic", kind, () => ({
    quantity: u.output_tokens,
    unit: "output_tokens",
    costUsd: claudeCostUsd(model, u),
    meta: {
      model,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
    },
  }));
}

/** One transcribed track. `seconds` is Deepgram's own metadata.duration. */
export async function recordDeepgramUsage(kind: string, model: string, seconds: number): Promise<void> {
  await record("deepgram", kind, () => ({
    quantity: seconds,
    unit: "audio_seconds",
    costUsd: (seconds / 60) * deepgramUsdPerMin(),
    meta: { model },
  }));
}

/**
 * One email accepted by Resend. Marginal cost is zero inside the plan — the plan
 * itself is a fixed cost (FIXED_MONTHLY_COSTS) — so this row is for the count,
 * which is what hits Resend's daily and monthly caps.
 */
export async function recordEmailSent(kind: string): Promise<void> {
  await record("resend", kind, () => ({ quantity: 1, unit: "emails", costUsd: 0 }));
}
