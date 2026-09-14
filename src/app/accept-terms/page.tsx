// One-time Terms acceptance for tutors who haven't accepted the current version:
// Google accounts created from the login page, tutors who predate the checkbox,
// and everyone after TERMS_VERSION is bumped. The dashboard layout sends them here.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { acceptTerms, signOutAction } from "@/app/actions/auth";
import AuthLayout from "@/components/auth/AuthLayout";

export const metadata: Metadata = {
  title: "Accept the Terms",
  robots: { index: false, follow: false },
};

const POINTS = [
  "You get your student's consent before recording a lesson — and a parent's or guardian's if they're under 18.",
  "You check every AI-drafted report before sending it; once sent, it's yours.",
  "Recordings are deleted once your notes exist, and your material stays yours.",
];

export default async function AcceptTermsPage({ searchParams }: PageProps<"/accept-terms">) {
  const session = await auth();
  if (!session?.user?.tutorId) redirect("/login");
  const { missing } = await searchParams;

  return (
    <AuthLayout
      heading="One quick thing"
      sub="Before you start, please read and accept our terms."
    >
      <ul className="flex flex-col gap-3">
        {POINTS.map((p) => (
          <li key={p} className="flex items-start gap-3 text-[.95rem] text-ink-soft">
            <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-[7px] bg-brand-soft text-[.68rem] text-brand-deep">
              ✓
            </span>
            {p}
          </li>
        ))}
      </ul>

      <form action={acceptTerms} className="mt-7">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-line bg-brand-soft/40 px-4 py-3.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="acceptTerms"
            value="yes"
            required
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
        {missing ? (
          <p role="alert" className="mt-2 text-sm text-[#d9534f]">
            Please tick the box to continue.
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-5 w-full rounded-xl bg-brand px-6 py-3.5 font-semibold text-ink shadow-soft-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md"
        >
          Accept and continue
        </button>
      </form>

      <form action={signOutAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-muted hover:text-ink">
          Not now — sign out
        </button>
      </form>
    </AuthLayout>
  );
}
