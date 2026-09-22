import type { Metadata } from "next";
import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import { Script } from "@/components/bn/Bn";
import SignupOptions from "@/components/auth/SignupOptions";
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
      heading={<>Create your <Script className="text-sky-deep">account</Script></>}
      sub={
        intent.planName
          ? `Create your account, then choose how to pay for ${intent.planName}.`
          : "Start free — no card required. Cancel anytime."
      }
    >
      <SignupOptions intent={intent} />

      <p className="mt-8 text-center text-ink-soft">
        Already have an account?{" "}
        <Link href={`/login${intent.query}`} className="font-semibold text-cocoa underline underline-offset-2 hover:text-sky-deep">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
