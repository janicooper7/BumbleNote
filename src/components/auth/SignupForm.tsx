"use client";

import { useActionState } from "react";
import { signUpWithPassword, type AuthFormState } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from "@/lib/password-policy";
import AuthField from "./AuthField";
import PlanIntentFields, { type PlanIntent } from "./PlanIntentFields";

const initial: AuthFormState = {};

export default function SignupForm({ intent }: { intent?: PlanIntent }) {
  const [state, action, pending] = useActionState(signUpWithPassword, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <PlanIntentFields {...intent} />
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

      {state.formError ? (
        <p role="alert" className="text-sm text-[#d9534f]">
          {state.formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand px-6 py-3.5 font-semibold text-ink shadow-soft-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
