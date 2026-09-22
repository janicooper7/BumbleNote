import type { Metadata } from "next";
import Link from "next/link";
import CtaLink from "@/components/CtaLink";
import AuthLayout from "@/components/auth/AuthLayout";
import { Script } from "@/components/bn/Bn";
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
        heading={<>That link has <Script className="text-sky-deep">expired</Script></>}
        sub="Reset links work once and last an hour, so this one can't be used."
      >
        <CtaLink href="/forgot" arrow className="w-full">
          Send a new link
        </CtaLink>

        <p className="mt-8 text-center text-ink-soft">
          Or{" "}
          <Link href="/login" className="font-semibold text-cocoa underline underline-offset-2 hover:text-sky-deep">
            go back to log in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      heading={<>Choose a new <Script className="text-sky-deep">password</Script></>}
      sub={`Setting a new password for ${check.email}.`}
    >
      <ResetPasswordForm token={token ?? ""} />
    </AuthLayout>
  );
}
