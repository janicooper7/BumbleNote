import type { Metadata } from "next";
import Link from "next/link";
import AuthDivider from "@/components/auth/AuthDivider";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleAuthForm from "@/components/auth/GoogleAuthForm";
import SignupForm from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create your account",
  alternates: { canonical: "/signup" },
  description: "Start free — no card required. Better feedback for every student.",
};

export default function SignupPage() {
  return (
    <AuthLayout
      heading="Create your account"
      sub="Start free — no card required. Cancel anytime."
    >
      <GoogleAuthForm label="Sign up with Google" />

      <AuthDivider label="or sign up with email" />

      <SignupForm />

      <p className="mt-6 text-center text-sm text-muted">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="text-brand-deep hover:underline">Terms</Link> and{" "}
        <Link href="/privacy" className="text-brand-deep hover:underline">Privacy Policy</Link>.
      </p>

      <p className="mt-6 text-center text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-deep hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
