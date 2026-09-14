import type { Metadata } from "next";
import Link from "next/link";
import AuthDivider from "@/components/auth/AuthDivider";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleAuthForm from "@/components/auth/GoogleAuthForm";
import SignupForm from "@/components/auth/SignupForm";
import { planIntentFrom } from "@/lib/plan-intent";

export const metadata: Metadata = {
  title: "Create your account",
  alternates: { canonical: "/signup" },
  description: "Start free — no card required. Better feedback for every student.",
};

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  // Arriving from a pricing card (?plan=pro&billing=annual): after the account
  // is created the tutor goes straight to Checkout for that plan.
  const intent = planIntentFrom(await searchParams);

  return (
    <AuthLayout
      heading="Create your account"
      sub={
        intent.planName
          ? `Create your account, then choose how to pay for ${intent.planName}.`
          : "Start free — no card required. Cancel anytime."
      }
    >
      <GoogleAuthForm label="Sign up with Google" intent={intent} />

      <AuthDivider label="or sign up with email" />

      <SignupForm intent={intent} />

      <p className="mt-6 text-center text-sm text-muted">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="text-brand-deep hover:underline">Terms</Link> and{" "}
        <Link href="/privacy" className="text-brand-deep hover:underline">Privacy Policy</Link>.
      </p>

      <p className="mt-6 text-center text-ink-soft">
        Already have an account?{" "}
        <Link href={`/login${intent.query}`} className="font-semibold text-brand-deep hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
