// Shown the moment a dashboard link is clicked, inside the already-rendered
// sidebar, while the next page renders on the server. Every dashboard page is
// dynamic (per-tutor data), so without this boundary Next can't prefetch
// anything and a click visibly does nothing until the whole page is ready.
//
// Mirrors Topbar's shell so the header strip doesn't jump when the page lands.

function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-cocoa/10 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="border-b border-cocoa/15 bg-white/90">
        <div className="px-6 py-4 lg:px-10">
          <Bar className="h-9 w-56" />
          <Bar className="mt-2 h-4 w-72 max-w-full" />
        </div>
      </div>

      <div className="px-6 py-8 lg:px-10">
        <div className="max-w-5xl divide-y divide-line border-y border-line">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-4">
              <div className="h-10 w-10 flex-none rounded-full bg-cocoa/10" />
              <div className="min-w-0 flex-1">
                <Bar className="h-4 w-48 max-w-full" />
                <Bar className="mt-2 h-3.5 w-32 max-w-full" />
              </div>
              <Bar className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
