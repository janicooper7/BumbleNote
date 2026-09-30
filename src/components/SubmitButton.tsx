"use client";

// A submit button that shows a spinner while its <form> is being handled —
// for server-component forms (sign out, the site gate) that have no client
// state of their own to hang a pending flag on.

import { useFormStatus } from "react-dom";
import Spinner from "./Spinner";

export default function SubmitButton({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 disabled:cursor-wait ${className}`}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
