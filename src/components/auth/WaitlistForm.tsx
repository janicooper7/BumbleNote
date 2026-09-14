"use client";

import Link from "next/link";
import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";

const initial: WaitlistState = { status: "idle" };

export default function WaitlistForm({ autoFocus = true }: { autoFocus?: boolean }) {
  const [state, action, pending] = useActionState(joinWaitlist, initial);

  if (state.status === "joined") {
    return (
      <div
        role="status"
        className="animate-[ct-rise_.5s_var(--ease-smooth)_both] rounded-2xl border border-brand-line bg-brand-soft px-5 py-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-brand text-sm font-bold text-ink">
            ✓
          </span>
          <div>
            <p className="font-semibold text-ink">You&apos;re on the list</p>
            <p className="mt-1 text-sm text-ink-soft">
              We&apos;ll email <span className="font-medium text-ink">{state.email}</span> the
              moment BumbleNote opens.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      {/* honeypot — hidden from people, tempting to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">Email address</span>
        <input
          type="email"
          name="email"
          required
          autoFocus={autoFocus}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!error}
          aria-describedby={error ? "waitlist-error" : undefined}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-ink outline-none transition-all duration-200 placeholder:text-muted focus:ring-4 ${
            error
              ? "border-[#e77] focus:border-[#e77] focus:ring-[#e77]/15"
              : "border-brand-line focus:border-brand focus:ring-brand/30"
          }`}
        />
        {error ? (
          <span id="waitlist-error" className="mt-1.5 block text-sm text-[#d9534f]">
            {error}
          </span>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-xl bg-brand px-6 py-3.5 font-semibold text-ink shadow-soft-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md disabled:translate-y-0 disabled:opacity-70"
      >
        {pending ? "Adding you…" : "Notify me at launch"}
      </button>

      <p className="text-center text-xs leading-relaxed text-muted">
        By joining, you agree to us storing your email to tell you when BumbleNote
        launches. No spam — ask us to remove you any time. See our{" "}
        <Link
          href="/privacy"
          className="font-medium text-brand-deep underline decoration-brand-line underline-offset-2 hover:decoration-brand-deep"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
