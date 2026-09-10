import type { Metadata } from "next";
import Link from "next/link";
import AuthDivider from "@/components/auth/AuthDivider";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleAuthForm from "@/components/auth/GoogleAuthForm";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  alternates: { canonical: "/login" },
  description: "Welcome back to BumbleNote.",
};

export default function LoginPage() {
  return (
    <AuthLayout heading="Welcome back" sub="Log in to pick up where you left off.">
      <GoogleAuthForm label="Continue with Google" />

      <AuthDivider label="or log in with email" />

      <LoginForm />

      <p className="mt-6 text-center text-ink-soft">
        New to BumbleNote?{" "}
        <Link href="/signup" className="font-semibold text-brand-deep hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
