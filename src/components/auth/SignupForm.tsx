"use client";

import { useActionState } from "react";
import { signUpWithPassword, type AuthFormState } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from "@/lib/password-policy";
import AuthField from "./AuthField";
import AuthSubmit from "./AuthSubmit";
import PlanIntentFields, { type PlanIntent } from "./PlanIntentFields";

const initial: AuthFormState = {};

export default function SignupForm({
  intent,
  accepted,
}: {
  intent?: PlanIntent;
  /** The Terms checkbox, owned by SignupOptions so it also gates Google. */
  accepted: boolean;
}) {
  const [state, action, pending] = useActionState(signUpWithPassword, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <PlanIntentFields {...intent} />
      {accepted && <input type="hidden" name="acceptTerms" value="yes" />}
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField
          label="First name"
          name="firstName"
          autoComplete="given-name"
          defaultValue={state.values?.firstName}
          error={state.errors?.firstName}
        />
        <AuthField
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          defaultValue={state.values?.lastName}
          error={state.errors?.lastName}
        />
      </div>

      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.errors?.email}
      />

      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={PASSWORD_HINT}
        error={state.errors?.password}
      />

      {state.errors?.acceptTerms && !accepted ? (
        <p role="alert" className="text-sm text-[#c0392b]">
          {state.errors.acceptTerms}
        </p>
      ) : null}

      {state.formError ? (
        <p role="alert" className="text-sm text-[#c0392b]">
          {state.formError}
        </p>
      ) : null}

      <AuthSubmit pending={pending} pendingLabel="Creating your account…" disabled={!accepted}>

        Create account

      </AuthSubmit>
    </form>
  );
}
