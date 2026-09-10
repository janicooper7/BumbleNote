import type { Metadata } from "next";
import { enterSite } from "@/app/actions/gate";
import AuthLayout from "@/components/auth/AuthLayout";
import { safeReturnPath } from "@/lib/site-gate";

export const metadata: Metadata = {
  title: { absolute: "BumbleNote" },
  // Nothing behind the gate should be indexed while the site is private.
  robots: { index: false, follow: false },
};

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  const target = safeReturnPath(from);

  return (
    <AuthLayout
      heading="This site is private"
      sub="BumbleNote isn't open to the public yet. Enter the access password to continue."
    >
      <form action={enterSite} className="flex flex-col gap-5">
        <input type="hidden" name="from" value={target} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">
            Access password
          </span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            aria-invalid={!!error}
            aria-describedby={error ? "gate-error" : undefined}
            className={`w-full rounded-xl border bg-white px-4 py-3 text-ink outline-none transition-all duration-200 placeholder:text-muted focus:ring-4 ${
              error
                ? "border-[#e77] focus:border-[#e77] focus:ring-[#e77]/15"
                : "border-brand-line focus:border-brand focus:ring-brand/30"
            }`}
          />
          {error ? (
            <span id="gate-error" className="mt-1.5 block text-sm text-[#d9534f]">
              That password isn&apos;t right — check it and try again.
            </span>
          ) : null}
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-brand px-6 py-3.5 font-semibold text-ink shadow-soft-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md"
        >
          Continue
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account? You&apos;ll still sign in with Google after this step.
      </p>
    </AuthLayout>
  );
}
