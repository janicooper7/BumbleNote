// POST /api/stripe/webhook — Stripe telling us a subscription changed.
//
// Lives under /api so src/proxy.ts (site gate, dashboard auth) never touches
// it; the signature check below is its authentication.
//
// Events to enable on the endpoint (Stripe dashboard → Developers → Webhooks):
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   subscription_schedule.updated / released / canceled / completed
//     (a downgrade queued for renewal is a schedule; changing it doesn't always
//     touch the subscription itself)
//
// Every event is reduced to a subscription id and handed to syncSubscription(),
// which re-reads the subscription from Stripe. So a retried, duplicated or
// out-of-order event does no harm. The one exception is a paid Checkout for a
// pack of extra lessons, which has no subscription: it's recorded by
// grantLessonPack(), idempotent on the session id.
//
// Status codes matter: a non-2xx makes Stripe retry for up to three days, which
// is what we want for a transient failure (DB blip) and NOT what we want for a
// bad signature, so those are 400.

import type Stripe from "stripe";
import { alertOperator } from "@/lib/alerts";
import { stripe, syncSubscription } from "@/lib/billing";
import { env } from "@/lib/env";
import { grantLessonPack } from "@/lib/lesson-packs";

function subscriptionIdOf(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const sub = event.data.object.subscription;
      if (!sub) return null; // a one-off payment, not ours
      return typeof sub === "string" ? sub : sub.id;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "subscription_schedule.updated":
    case "subscription_schedule.released":
    case "subscription_schedule.canceled":
    case "subscription_schedule.completed": {
      const schedule = event.data.object;
      const sub = schedule.subscription ?? schedule.released_subscription;
      if (!sub) return null;
      return typeof sub === "string" ? sub : sub.id;
    }
    default:
      return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature.", { status: 400 });

  // Signature verification needs the exact bytes Stripe signed, so the body is
  // read as text and never re-serialised.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }

  const subscriptionId = subscriptionIdOf(event);
  const packSession =
    event.type === "checkout.session.completed" && event.data.object.metadata?.kind === "lesson_pack"
      ? event.data.object
      : null;
  if (!subscriptionId && !packSession) return new Response("Ignored.", { status: 200 });

  try {
    if (subscriptionId) await syncSubscription(subscriptionId);
    if (packSession) await grantLessonPack(packSession);
  } catch (err) {
    console.error(`stripe webhook ${event.type} failed`, err);
    await alertOperator({
      subject: "Stripe webhook failed",
      summary: packSession
        ? "A paid pack of extra lessons couldn't be recorded, so the tutor may not have them yet. " +
          "Stripe will retry automatically."
        : "A subscription change couldn't be applied, so a tutor's plan may be wrong. " +
          "Stripe will retry automatically.",
      fingerprint: `stripe-webhook:${event.type}`,
      fields: {
        event: event.type,
        eventId: event.id,
        subscription: subscriptionId ?? "none (lesson pack)",
        session: packSession?.id ?? "",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return new Response("Sync failed.", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
