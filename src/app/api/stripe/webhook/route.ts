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
//
// Every event is reduced to a subscription id and handed to syncSubscription(),
// which re-reads the subscription from Stripe. So a retried, duplicated or
// out-of-order event does no harm.
//
// Status codes matter: a non-2xx makes Stripe retry for up to three days, which
// is what we want for a transient failure (DB blip) and NOT what we want for a
// bad signature, so those are 400.

import type Stripe from "stripe";
import { alertOperator } from "@/lib/alerts";
import { stripe, syncSubscription } from "@/lib/billing";
import { env } from "@/lib/env";

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
  if (!subscriptionId) return new Response("Ignored.", { status: 200 });

  try {
    await syncSubscription(subscriptionId);
  } catch (err) {
    console.error(`stripe webhook ${event.type} failed`, err);
    await alertOperator({
      subject: "Stripe webhook failed",
      summary:
        "A subscription change couldn't be applied, so a tutor's plan may be wrong. " +
        "Stripe will retry automatically.",
      fingerprint: `stripe-webhook:${event.type}`,
      fields: {
        event: event.type,
        eventId: event.id,
        subscription: subscriptionId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return new Response("Sync failed.", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
