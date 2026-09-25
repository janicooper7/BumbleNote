"use server";

// Server Actions behind Settings → Billing: change plan, pause, resume. Scoped to
// the signed-in tutor (the id comes from the session). The Stripe work lives in
// src/lib/billing.ts; these only translate its outcome for the client.

import { revalidatePath } from "next/cache";
import { currentTutorId } from "@/auth";
import {
  BillingError,
  changePlan as changePlanFor,
  isPaidPlanId,
  pauseSubscription as pauseFor,
  resumeSubscription as resumeFor,
} from "@/lib/billing";

/**
 * Failures come back as values: Next redacts thrown Server Action messages in
 * production, and these are messages the tutor needs to read.
 */
export type BillingActionResult = { ok: true } | { ok: false; error: string };

async function run(label: string, work: (tutorId: string) => Promise<void>): Promise<BillingActionResult> {
  const tutorId = await currentTutorId();
  try {
    await work(tutorId);
  } catch (err) {
    if (err instanceof BillingError) return { ok: false, error: err.message };
    console.error(`billing ${label} failed`, err);
    return {
      ok: false,
      error: "We couldn't reach our payment provider. Try again, or email us if it keeps happening.",
    };
  }
  // The sidebar's lesson count reads the plan too.
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function changePlan(plan: string): Promise<BillingActionResult> {
  if (!isPaidPlanId(plan)) return { ok: false, error: "That isn't a plan we offer." };
  return run("change plan", (tutorId) => changePlanFor(tutorId, plan));
}

export async function pauseSubscription(): Promise<BillingActionResult> {
  return run("pause", pauseFor);
}

export async function resumeSubscription(): Promise<BillingActionResult> {
  return run("resume", resumeFor);
}
