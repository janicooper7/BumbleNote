"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";

const initial: WaitlistState = { status: "idle" };

// One field, one pill: the email box and the button sit on a single row (they
// stack on phones), so subscribing is type-and-go. `tone` matches the section
// it's dropped into — cocoa pill on white, butter pill on cocoa — the same pair
// as CtaLink's primary / light variants.
export default function WaitlistForm({
  autoFocus = false,
  tone = "onLight",
  cta = "Notify me",
}: {
  autoFocus?: boolean;
  tone?: "onLight" | "onDark";
  cta?: string;
}) {
  const [state, action, pending] = useActionState(joinWaitlist, initial);
  // The page carries the form twice, so ids can't be hard-coded.
  const errorId = useId();
  const dark = tone === "onDark";

  if (state.status === "joined") {
    return (
      <div
        role="status"
        className={`animate-[ct-rise_.5s_var(--ease-smooth)_both] rounded-[28px] px-6 py-5 text-left ${
          dark ? "bg-butter text-cocoa" : "bg-sky-soft text-cocoa"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-cocoa text-sm font-bold text-butter">
            ✓
          </span>
          <div>
            <p className="text-[.9rem] font-semibold uppercase tracking-[.14em]">
              You&apos;re on the list
            </p>
            <p className="mt-1 text-[.97rem] text-cocoa/80">
              We&apos;ll email <span className="font-semibold text-cocoa">{state.email}</span>{" "}
              the moment BumbleNote opens.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : null;

  return (
    <form action={action} className="w-full">
      {/* honeypot — hidden from people, tempting to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div
        className={`flex flex-col gap-2 rounded-[32px] p-2 sm:flex-row sm:items-center sm:rounded-full ${
          dark ? "bg-butter/10 ring-1 ring-butter/25" : "bg-white ring-[1.5px] ring-cocoa/20"
        } ${error ? "!ring-[#e77]" : ""}`}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Email address</span>
          <input
            type="email"
            name="email"
            required
            autoFocus={autoFocus}
            autoComplete="email"
            inputMode="email"
            placeholder="Your email address"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={`w-full rounded-full bg-transparent px-5 py-3.5 text-[1.05rem] outline-none ${
              dark ? "text-butter placeholder:text-butter/55" : "text-cocoa placeholder:text-cocoa/45"
            }`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={`group inline-flex flex-none items-center justify-center gap-2.5 rounded-full px-7 py-4 text-[.9rem] font-semibold uppercase tracking-[.12em] transition-all duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70 ${
            dark ? "bg-butter text-cocoa hover:bg-white" : "bg-cocoa text-butter hover:bg-cocoa-lift"
          }`}
        >
          {pending ? "Adding you…" : cta}
          {!pending && (
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          )}
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className={`mt-3 text-[.95rem] ${dark ? "text-[#ffb4a8]" : "text-[#c0392b]"}`}>
          {error}
        </p>
      ) : null}

      <p className={`mt-4 text-[.82rem] leading-relaxed ${dark ? "text-butter/65" : "text-ink-soft"}`}>
        One email when we launch. No spam, and you can ask us to remove you any time.{" "}
        <Link
          href="/privacy"
          className={`underline underline-offset-2 ${dark ? "hover:text-butter" : "hover:text-cocoa"}`}
        >
          Privacy Policy
        </Link>
      </p>
    </form>
  );
}
