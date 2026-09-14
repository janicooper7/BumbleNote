import type { Metadata } from "next";
import Link from "next/link";
import AuthDivider from "@/components/auth/AuthDivider";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleAuthForm from "@/components/auth/GoogleAuthForm";
import LoginForm from "@/components/auth/LoginForm";
import { planIntentFrom } from "@/lib/plan-intent";

export const metadata: Metadata = {
  title: "Log in",
  alternates: { canonical: "/login" },
  description: "Welcome back to BumbleNote.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // An existing tutor who picked a plan on the pricing page and then followed
  // "Log in" from signup keeps their choice through to Checkout.
  const intent = planIntentFrom(await searchParams);

  return (
    <AuthLayout
      heading="Welcome back"
      sub={
        intent.planName
          ? `Log in to continue to ${intent.planName}.`
          : "Log in to pick up where you left off."
      }
    >
      <GoogleAuthForm label="Continue with Google" intent={intent} />

      <AuthDivider label="or log in with email" />

      <LoginForm intent={intent} />

      <p className="mt-6 text-center text-ink-soft">
        New to BumbleNote?{" "}
        <Link href={`/signup${intent.query}`} className="font-semibold text-brand-deep hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
