import Link from "next/link";
import Logo from "../Logo";

const bullets = [
  "AI-drafted feedback after every lesson",
  "Student & tutor notes, ready to send",
  "A living progress journey per student",
];

export default function AuthLayout({
  children,
  heading,
  sub,
  eyebrow,
}: {
  children: React.ReactNode;
  heading: string;
  sub: string;
  eyebrow?: string;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <aside
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16"
        style={{ background: "linear-gradient(155deg,var(--panel),var(--panel-lift))" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 55% at 85% 8%, rgba(253,179,0,.20), transparent 60%), radial-gradient(45% 45% at 5% 100%, rgba(94,224,200,.14), transparent 60%)",
          }}
        />
        <Link href="/" className="relative flex items-center">
          <Logo tone="light" />
        </Link>

        <div className="relative max-w-md">
          <h2 className="font-display text-[clamp(2rem,3vw,2.6rem)] font-medium leading-tight">
            Teach the lesson. We&apos;ll write the notes.
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-3 text-[1.02rem] text-[var(--panel-text)]">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-brand/25 text-[.72rem] text-brand-lit">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative rounded-2xl border border-white/15 bg-white/[.08] p-5 backdrop-blur">
          <p className="text-[1.02rem] italic text-[var(--panel-text)]">
            &ldquo;It gives my students better feedback than I had time to write — and I get
            my evenings back.&rdquo;
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl font-display font-semibold text-ink"
              style={{ background: "linear-gradient(145deg,#ffd143,#f0a500)" }}
            >
              J
            </span>
            <div className="text-[.9rem]">
              <div className="font-semibold text-white">Jamie R.</div>
              <div className="text-[var(--panel-dim)]">English tutor · 40 students</div>
            </div>
          </div>
        </div>
      </aside>

      {/* form side */}
      <main className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-[420px]">
          {/* compact logo for mobile */}
          <Link href="/" className="mb-10 flex items-center lg:hidden">
            <Logo />
          </Link>

          {eyebrow ? (
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-[.08em] text-brand-deep">
              <span className="h-1.5 w-1.5 animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full bg-brand" />
              {eyebrow}
            </span>
          ) : null}
          <h1 className="font-display text-[2.1rem] font-medium tracking-tight text-ink">
            {heading}
          </h1>
          <p className="mt-2 text-ink-soft">{sub}</p>

          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
