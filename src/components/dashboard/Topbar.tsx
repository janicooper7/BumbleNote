export default function Topbar({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-cocoa/15 bg-white/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 py-4 lg:px-10">
        <div>
          <h1 className="font-display text-[1.9rem] uppercase leading-tight tracking-[.02em] text-cocoa">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
