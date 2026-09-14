// Centralized, validated environment access. Import from here rather than
// reaching for process.env directly so a missing/blank value fails loudly with
// a helpful message instead of a cryptic runtime error deep in a query.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and set it (see .env.example for where to find the value).`,
    );
  }
  return value;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get ANTHROPIC_API_KEY() {
    return required("ANTHROPIC_API_KEY");
  },
  get RESEND_API_KEY() {
    return required("RESEND_API_KEY");
  },
  get DEEPGRAM_API_KEY() {
    return required("DEEPGRAM_API_KEY");
  },
  // Shared secret gating the internal background-processing function so only our
  // own /api/upload/complete route can trigger it (the function's URL is public).
  get INTERNAL_TASK_SECRET() {
    return required("INTERNAL_TASK_SECRET");
  },
  // Stripe billing (src/lib/billing.ts). Use the sk_test_ key everywhere except
  // the production Netlify site.
  get STRIPE_SECRET_KEY() {
    return required("STRIPE_SECRET_KEY");
  },
  // Signing secret for /api/stripe/webhook (whsec_…). Each webhook endpoint —
  // and each `stripe listen` session — has its own.
  get STRIPE_WEBHOOK_SECRET() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  // Shared password for the pre-launch site gate (src/lib/site-gate.ts). This
  // one is deliberately optional: unset means the gate is off and the site is
  // public, which is the safe failure mode for a live site.
  get SITE_PASSWORD() {
    return process.env.SITE_PASSWORD ?? "";
  },
  /**
   * Where operator alerts go when something breaks (src/lib/alerts.ts).
   *
   * Falls back to the first address on ADMIN_EMAILS, since whoever operates the
   * recovery tools is the person who needs to know a lesson failed. Empty means
   * alerting is off — deliberately not `required()`, because a missing alert
   * address must never be the thing that takes the site down.
   */
  get ALERT_EMAIL() {
    const explicit = process.env.ALERT_EMAIL?.trim();
    if (explicit) return explicit;
    return (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim() ?? "";
  },
  // The From address for lesson-report emails. Resend's shared sandbox address
  // works for testing (only delivers to your own account email); set a verified
  // domain sender for real students.
  get EMAIL_FROM() {
    return process.env.EMAIL_FROM || "BumbleNote <onboarding@resend.dev>";
  },
};
