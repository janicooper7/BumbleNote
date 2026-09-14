import type { Metadata } from "next";
import { enterSite } from "@/app/actions/gate";
import AuthLayout from "@/components/auth/AuthLayout";
import WaitlistForm from "@/components/auth/WaitlistForm";
import { safeReturnPath } from "@/lib/site-gate";

export const metadata: Metadata = {
  title: { absolute: "BumbleNote — coming soon" },
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
      eyebrow="Coming soon"
      heading="Lesson notes that write themselves"
      sub="BumbleNote is almost ready. Leave your email and you'll be the first to know when we open the doors."
    >
      <WaitlistForm autoFocus={!error} />

      {/* Early access — the shared pre-launch password (src/lib/site-gate.ts).
          Opens by itself after a wrong attempt so the error is visible. */}
      <details
        open={!!error}
        className="group mt-10 border-t border-line pt-6 [&_summary::-webkit-details-marker]:hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink-soft transition-colors duration-200 hover:text-ink">
          Have an early-access password?
          <span className="text-muted transition-transform duration-300 group-open:rotate-180">
            ▾
          </span>
        </summary>

        <form action={enterSite} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="from" value={target} />

          <label className="block">
            <span className="sr-only">Access password</span>
            <div className="flex gap-2">
              <input
                type="password"
                name="password"
                required
                autoFocus={!!error}
                autoComplete="current-password"
                placeholder="Access password"
                aria-invalid={!!error}
                aria-describedby={error ? "gate-error" : undefined}
                className={`min-w-0 flex-1 rounded-xl border bg-white px-4 py-3 text-ink outline-none transition-all duration-200 placeholder:text-muted focus:ring-4 ${
                  error
                    ? "border-[#e77] focus:border-[#e77] focus:ring-[#e77]/15"
                    : "border-line focus:border-brand focus:ring-brand/30"
                }`}
              />
              <button
                type="submit"
                className="flex-none rounded-xl bg-ink px-5 py-3 font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md"
              >
                Enter
              </button>
            </div>
            {error ? (
              <span id="gate-error" className="mt-1.5 block text-sm text-[#d9534f]">
                That password isn&apos;t right — check it and try again.
              </span>
            ) : null}
          </label>
        </form>
      </details>
    </AuthLayout>
  );
}
