"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logInWithPassword, type AuthFormState } from "@/app/actions/auth";
import AuthField from "./AuthField";
import AuthSubmit from "./AuthSubmit";
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
          <Link href="/forgot" className="text-sm text-sky-deep underline-offset-2 hover:underline">
            Forgot your password?
          </Link>
        </div>
      </div>

      {state.formError ? (
        <p role="alert" className="text-sm text-[#c0392b]">
          {state.formError}
        </p>
      ) : null}

      <AuthSubmit pending={pending} pendingLabel="Logging in…">

        Log in

      </AuthSubmit>
    </form>
  );
}
