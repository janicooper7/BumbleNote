/**
 * Carries the plan picked on the pricing page through an auth form, so the
 * action can send the tutor on to Checkout once they're signed in. The action
 * re-validates both values (lib/billing checkoutPath) — these are just hints.
 */
export type PlanIntent = { plan?: string; billing?: string };

export default function PlanIntentFields({ plan, billing }: PlanIntent) {
  if (!plan) return null;
  return (
    <>
      <input type="hidden" name="plan" value={plan} />
      {billing ? <input type="hidden" name="billing" value={billing} /> : null}
    </>
  );
}
