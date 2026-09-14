export default function Topbar({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 py-4 lg:px-10">
        <div>
          <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
