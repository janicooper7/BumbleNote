// One-time Terms acceptance for tutors who haven't accepted the current version:
// Google accounts created from the login page, tutors who predate the checkbox,
// and everyone after TERMS_VERSION is bumped. The dashboard layout sends them here.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { acceptTerms, signOutAction } from "@/app/actions/auth";
import AuthLayout from "@/components/auth/AuthLayout";
import { Asterisk, Script } from "@/components/bn/Bn";
import AuthSubmit from "@/components/auth/AuthSubmit";

export const metadata: Metadata = {
  title: "Accept the Terms",
  robots: { index: false, follow: false },
};

const POINTS = [
  "You get your student's consent before recording a lesson — and a parent's or guardian's if they're under 18.",
  "You check every AI-drafted report before sending it; once sent, it's yours.",
  "Recordings are deleted once your notes exist, and your material stays yours.",
  "We process your students' data only on your behalf, under the data processing terms.",
];

export default async function AcceptTermsPage({ searchParams }: PageProps<"/accept-terms">) {
  const session = await auth();
  if (!session?.user?.tutorId) redirect("/login");
  const { missing } = await searchParams;

  return (
    <AuthLayout
      heading={<>One <Script className="text-sky-deep">quick</Script> thing</>}
      sub="Before you start, please read and accept our terms."
    >
      <ul className="flex flex-col gap-3">
        {POINTS.map((p) => (
          <li key={p} className="flex items-start gap-3 text-[.95rem] text-ink-soft">
            <span className="mt-1 flex-none text-sky-deep">
              <Asterisk className="h-4 w-4" />
            </span>
            {p}
          </li>
        ))}
      </ul>

      <form action={acceptTerms} className="mt-7">
        <label className="flex cursor-pointer items-start gap-3 rounded-[24px] bg-sky-soft px-5 py-4 text-sm leading-relaxed text-ink-soft">
          <input
            type="checkbox"
            name="acceptTerms"
            value="yes"
            required
            className="mt-0.5 h-4 w-4 flex-none accent-cocoa"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-cocoa underline underline-offset-2 hover:text-sky-deep">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-cocoa underline underline-offset-2 hover:text-sky-deep">
              Privacy Policy
            </Link>
            , and I&apos;ll get my students&apos; consent before recording their lessons.
          </span>
        </label>
        {missing ? (
          <p role="alert" className="mt-2 text-sm text-[#c0392b]">
            Please tick the box to continue.
          </p>
        ) : null}
        <AuthSubmit className="mt-5">Accept and continue</AuthSubmit>
      </form>

      <form action={signOutAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-muted underline-offset-2 hover:text-cocoa hover:underline">
          Not now — sign out
        </button>
      </form>
    </AuthLayout>
  );
}
