"use client";

// Both ways to sign up, behind one Terms checkbox. It sits above the Google
// button so nobody can create an account either way without ticking it first.
// The actions re-check it server-side (signUpWithPassword, signInWithGoogle) —
// the disabled buttons are only a convenience.

import Link from "next/link";
import { useState } from "react";
import { signInWithGoogle } from "@/app/actions/auth";
import AuthDivider from "./AuthDivider";
import GoogleButton from "./GoogleButton";
import PlanIntentFields, { type PlanIntent } from "./PlanIntentFields";
import SignupForm from "./SignupForm";

export default function SignupOptions({ intent }: { intent?: PlanIntent }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <>
      <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-line bg-brand-soft/40 px-4 py-3.5 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-none accent-brand"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="font-semibold text-brand-deep hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="font-semibold text-brand-deep hover:underline">
            Privacy Policy
          </Link>
          , and I&apos;ll get my students&apos; consent before recording their lessons.
        </span>
      </label>

      <form action={signInWithGoogle}>
        <PlanIntentFields {...intent} />
        {accepted && <input type="hidden" name="acceptTerms" value="yes" />}
        <GoogleButton label="Sign up with Google" submit disabled={!accepted} />
      </form>

      <AuthDivider label="or sign up with email" />

      <SignupForm intent={intent} accepted={accepted} />
    </>
  );
}
