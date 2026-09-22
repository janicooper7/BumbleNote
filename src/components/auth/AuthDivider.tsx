// A rule with a word set into it, separating the Google button from the
// email/password form.

export default function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-7 flex items-center gap-4" aria-hidden>
      <span className="h-px flex-1 bg-cocoa/15" />
      <span className="text-[.72rem] font-medium uppercase tracking-[.2em] text-muted">{label}</span>
      <span className="h-px flex-1 bg-cocoa/15" />
    </div>
  );
}
