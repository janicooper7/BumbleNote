// Sets up everything BumbleNote needs in Stripe. Safe to re-run.
//
//   npm run stripe:setup                           (test key in .env.local)
//   npm run stripe:setup -- --live                 (required for a live key)
//   npm run stripe:setup -- --live --test-coupon   (also mint a 100%-off code)
//
// 1. Products + prices. One product per paid plan (fixed ids: bumblenote_starter,
//    …) with a monthly and a yearly USD price, tagged with the lookup keys the app
//    searches by (src/lib/pricing.ts). If an amount in pricing.ts changed, a new
//    price is created, the lookup key moves onto it and the old one is archived.
//    Existing subscribers keep their old amount until moved in Stripe.
// 2. Customer portal configuration named "BumbleNote" (src/lib/billing.ts
//    portalUrl finds it by that name): cancel at period end, switch between the
//    plans, update card, invoice history.
// 3. Webhook endpoint for WEBHOOK_URL. Stripe only reveals a signing secret when
//    the endpoint is created, so it's saved into .env.local right then.
// 4. With --test-coupon: a single-use 100%-off promotion code for trying the
//    paid flow on a real card without being charged.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import Stripe from "stripe";
import {
  PAID_PLAN_IDS,
  PLAN_PRICES_USD,
  PORTAL_CONFIG_NAME,
  priceLookupKey,
  toCents,
  type BillingInterval,
} from "../src/lib/pricing";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const SITE = "https://bumblenote.com";
const WEBHOOK_URL = `${SITE}/api/stripe/webhook`;
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "subscription_schedule.updated",
  "subscription_schedule.released",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
];

const NAMES = { starter: "Starter", advanced: "Advanced", pro: "Pro" } as const;
const LESSONS = { starter: 30, advanced: 75, pro: 130 } as const;

async function setUpPrices(stripe: Stripe) {
  const portalProducts: { product: string; prices: string[] }[] = [];

  for (const plan of PAID_PLAN_IDS) {
    const productId = `bumblenote_${plan}`;
    let product: Stripe.Product;
    try {
      product = await stripe.products.retrieve(productId);
      console.log(`✓ product ${productId}`);
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeInvalidRequestError) || err.statusCode !== 404) throw err;
      product = await stripe.products.create({
        id: productId,
        name: `BumbleNote ${NAMES[plan]}`,
        description: `Up to ${LESSONS[plan]} lessons a month`,
      });
      console.log(`+ product ${productId}`);
    }

    const prices: string[] = [];
    for (const interval of ["month", "year"] as BillingInterval[]) {
      const lookupKey = priceLookupKey(plan, interval);
      const cents = toCents(PLAN_PRICES_USD[plan][interval]);
      const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
      const current = data[0];

      if (
        current?.active &&
        current.unit_amount === cents &&
        current.currency === "usd" &&
        current.recurring?.interval === interval
      ) {
        console.log(`  ✓ ${lookupKey} = $${cents / 100}/${interval}`);
        prices.push(current.id);
        continue;
      }

      const created = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: cents,
        recurring: { interval },
        lookup_key: lookupKey,
        transfer_lookup_key: true,
      });
      if (current?.active) await stripe.prices.update(current.id, { active: false });
      console.log(`  + ${lookupKey} = $${cents / 100}/${interval}${current ? " (replaced old price)" : ""}`);
      prices.push(created.id);
    }
    portalProducts.push({ product: product.id, prices });
  }
  return portalProducts;
}

async function setUpPortal(stripe: Stripe, products: { product: string; prices: string[] }[]) {
  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    name: PORTAL_CONFIG_NAME,
    default_return_url: `${SITE}/dashboard/settings`,
    business_profile: {
      privacy_policy_url: `${SITE}/privacy`,
      terms_of_service_url: `${SITE}/terms`,
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      // At period end: they've paid for the month, so they keep it.
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products,
      },
    },
  };

  const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const existing = data.find((c) => c.name === PORTAL_CONFIG_NAME);
  if (existing) {
    await stripe.billingPortal.configurations.update(existing.id, params);
    console.log(`✓ portal configuration updated (${existing.id})`);
  } else {
    const created = await stripe.billingPortal.configurations.create(params);
    console.log(`+ portal configuration created (${created.id})`);
  }
}

async function setUpWebhook(stripe: Stripe) {
  const { data } = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = data.find((w) => w.url === WEBHOOK_URL);
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS, disabled: false });
    console.log(`✓ webhook endpoint exists (${existing.id}) — its secret was shown when it was created;`);
    console.log(`  if you've lost it, roll it in the dashboard: Developers → Webhooks → ${existing.id}.`);
    return;
  }
  const created = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
    description: "BumbleNote plan sync",
  });
  console.log(`+ webhook endpoint created (${created.id})`);

  // Written straight into .env.local rather than printed, so the secret doesn't
  // end up in terminal scrollback or logs.
  const envPath = ".env.local";
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `STRIPE_WEBHOOK_SECRET="${created.secret}"`;
  const next = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(current)
    ? current.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, line)
    : `${current.replace(/\s*$/, "\n")}${line}\n`;
  writeFileSync(envPath, next);
  console.log(`  signing secret saved to ${envPath} as STRIPE_WEBHOOK_SECRET (${created.secret?.slice(0, 10)}…)`);
  console.log("  Copy it from there into Netlify's environment variables too.");
}

async function mintTestCoupon(stripe: Stripe) {
  const couponId = "bumblenote_internal_test_100";
  try {
    await stripe.coupons.retrieve(couponId);
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeInvalidRequestError) || err.statusCode !== 404) throw err;
    await stripe.coupons.create({
      id: couponId,
      name: "Internal testing (100% off)",
      percent_off: 100,
      // First invoice only. A forgotten test subscription then bills on renewal
      // rather than staying free forever — cancel test subscriptions when done.
      duration: "once",
    });
  }
  const code = `BEETEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: couponId },
    code,
    max_redemptions: 3,
    expires_at: Math.floor(Date.now() / 1000) + 14 * 24 * 3600,
  });
  console.log(`+ test promotion code: ${code}  (100% off first payment, 3 uses, expires in 14 days)`);
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set in .env.local.");
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (live && !process.argv.includes("--live")) {
    throw new Error("That's a LIVE key. Re-run with --live if you really mean to set up live mode.");
  }
  console.log(`Setting up Stripe in ${live ? "LIVE" : "test"} mode…\n`);

  const stripe = new Stripe(key);
  const products = await setUpPrices(stripe);
  await setUpPortal(stripe, products);
  await setUpWebhook(stripe);
  if (process.argv.includes("--test-coupon")) await mintTestCoupon(stripe);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
