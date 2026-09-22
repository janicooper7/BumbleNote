// Labelled input shared by the auth forms. The same pill as the waitlist field
// (src/components/auth/WaitlistForm.tsx) — thin cocoa ring, sky focus, the
// same error red.

export default function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  error,
  defaultValue,
  autoFocus,
  hint,
  minLength,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  error?: string;
  defaultValue?: string;
  autoFocus?: boolean;
  hint?: string;
  minLength?: number;
}) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;

  return (
    <label className="block">
      <span className="mb-2 block pl-1 text-[.75rem] font-semibold uppercase tracking-[.16em] text-cocoa">
        {label}
      </span>
      <input
        type={type}
        name={name}
        required
        minLength={minLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`w-full rounded-full bg-white px-5 py-3.5 text-[1.02rem] text-cocoa outline-none ring-[1.5px] transition-all duration-200 placeholder:text-cocoa/45 focus:ring-2 ${
          error ? "ring-[#e77] focus:ring-[#e77]" : "ring-cocoa/20 focus:ring-sky-deep"
        }`}
      />
      {error ? (
        <span id={`${name}-error`} className="mt-2 block pl-1 text-sm text-[#c0392b]">
          {error}
        </span>
      ) : hint ? (
        <span id={`${name}-hint`} className="mt-2 block pl-1 text-sm text-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
