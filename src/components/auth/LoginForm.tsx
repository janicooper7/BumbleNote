"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logInWithPassword, type AuthFormState } from "@/app/actions/auth";
import AuthField from "./AuthField";
import PlanIntentFields, { type PlanIntent } from "./PlanIntentFields";

const initial: AuthFormState = {};

export default function LoginForm({ intent }: { intent?: PlanIntent }) {
  const [state, action, pending] = useActionState(logInWithPassword, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <PlanIntentFields {...intent} />
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
      />

      <div>
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        <div className="mt-2 text-right">
          <Link href="/forgot" className="text-sm text-brand-deep hover:underline">
            Forgot your password?
          </Link>
        </div>
      </div>

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
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
