import { signInWithGoogle } from "@/app/actions/auth";
import GoogleButton from "./GoogleButton";
import PlanIntentFields, { type PlanIntent } from "./PlanIntentFields";

// Server component: a form whose action kicks off the Google OAuth flow.
export default function GoogleAuthForm({ label, intent }: { label: string; intent?: PlanIntent }) {
  return (
    <form action={signInWithGoogle}>
      <PlanIntentFields {...intent} />
      <GoogleButton label={label} submit />
    </form>
  );
}
