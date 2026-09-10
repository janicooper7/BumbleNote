import type { Metadata } from "next";
import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { checkResetToken } from "@/lib/reset-tokens";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Checked, not spent — the token is consumed when the new password is
  // submitted, so opening the page twice doesn't burn the link.
  const check = await checkResetToken(token ?? "");

  if (!check.ok) {
    return (
      <AuthLayout
        heading="That link has expired"
        sub="Reset links work once and last an hour, so this one can't be used."
      >
        <Link
          href="/forgot"
          className="block w-full rounded-xl bg-brand px-6 py-3.5 text-center font-semibold text-ink shadow-soft-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md"
        >
          Send a new link
        </Link>

        <p className="mt-6 text-center text-ink-soft">
          Or{" "}
          <Link href="/login" className="font-semibold text-brand-deep hover:underline">
            go back to log in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      heading="Choose a new password"
      sub={`Setting a new password for ${check.email}.`}
    >
      <ResetPasswordForm token={token ?? ""} />
    </AuthLayout>
  );
}
