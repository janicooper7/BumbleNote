import type { Metadata } from "next";
import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import { Script } from "@/components/bn/Bn";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      heading={<>Forgot your <Script className="text-sky-deep">password</Script>?</>}
      sub="Enter your email and we'll send you a link to set a new one."
    >
      <ForgotPasswordForm />

      <p className="mt-8 text-center text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-cocoa underline underline-offset-2 hover:text-sky-deep">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
