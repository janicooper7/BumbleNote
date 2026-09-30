// A small ring spinner in the current text colour, for buttons that are
// waiting on the server. Sized in em so it matches whatever label it sits by.

export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      className={`h-[1.1em] w-[1.1em] flex-none animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A pending button label with the spinner in front, e.g. <Busy>Saving…</Busy>. */
export function Busy({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Spinner />
      {children}
    </span>
  );
}
