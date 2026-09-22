"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthFormState } from "@/app/actions/auth";
import AuthField from "./AuthField";
import AuthSubmit from "./AuthSubmit";

const initial: AuthFormState = {};

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  // Deliberately the same receipt whether or not the address has an account —
  // see requestPasswordReset. Everything specific is said in the email itself.
  if (state.sent) {
    return (
      <div role="status" className="animate-[ct-rise_.5s_var(--ease-smooth)_both] rounded-[28px] bg-sky-soft p-7 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-cocoa text-lg text-butter">
          ✉
        </span>
        <p className="mt-4 text-[.9rem] font-semibold uppercase tracking-[.14em] text-cocoa">
          Check your inbox
        </p>
        <p className="mt-2 text-ink-soft">
          If there&apos;s a BumbleNote account for{" "}
          <span className="font-semibold text-cocoa">{state.values?.email}</span>, we&apos;ve
          sent it a link to reset the password. It expires in an hour.
        </p>
        <p className="mt-4 text-sm text-muted">
          Nothing after a few minutes? Check spam, then try again.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        defaultValue={state.values?.email}
        error={state.errors?.email}
      />

      {state.formError ? (
        <p role="alert" className="text-sm text-[#c0392b]">
          {state.formError}
        </p>
      ) : null}

      <AuthSubmit pending={pending} pendingLabel="Sending…">

        Send reset link

      </AuthSubmit>
    </form>
  );
}
