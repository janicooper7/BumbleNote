// The auth forms' submit button: CtaLink's cocoa pill, full width, with the
// trailing arrow while idle.

export default function AuthSubmit({
  children,
  pending = false,
  pendingLabel,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-cocoa px-7 py-4 text-[.9rem] font-semibold uppercase tracking-[.12em] text-butter transition-all duration-300 hover:-translate-y-0.5 hover:bg-cocoa-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:bg-cocoa ${className}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
      {!pending && (
        <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1 group-disabled:translate-x-0">
          →
        </span>
      )}
    </button>
  );
}
