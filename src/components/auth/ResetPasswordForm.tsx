"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPassword, type AuthFormState } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from "@/lib/password-policy";
import AuthField from "./AuthField";
import AuthSubmit from "./AuthSubmit";

const initial: AuthFormState = {};

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <AuthField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        autoFocus
        minLength={MIN_PASSWORD_LENGTH}
        hint={PASSWORD_HINT}
        error={state.errors?.password}
      />

      <AuthField
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={state.errors?.confirm}
      />

      {state.formError ? (
        <div role="alert" className="text-sm text-[#c0392b]">
          {state.formError}{" "}
          <Link href="/forgot" className="font-semibold underline">
            Request a new link
          </Link>
        </div>
      ) : null}

      <AuthSubmit pending={pending} pendingLabel="Saving…">

        Set new password

      </AuthSubmit>
    </form>
  );
}
