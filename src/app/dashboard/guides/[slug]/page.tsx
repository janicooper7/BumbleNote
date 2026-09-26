import Link from "next/link";
import { notFound } from "next/navigation";
import Topbar from "@/components/dashboard/Topbar";
import { GUIDES, getGuide, isVideoFile } from "@/lib/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const others = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <>
      <Topbar title={guide.title} subtitle="How-to guide" />
      <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
        <p className="text-ink-soft">{guide.summary}</p>

        <div className="mt-6 overflow-hidden rounded-[22px] border border-cocoa/15 bg-butter-soft">
          {guide.video ? (
            isVideoFile(guide.video) ? (
              <video
                src={guide.video}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black"
              />
            ) : (
              <iframe
                src={guide.video}
                title={guide.title}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="aspect-video w-full"
              />
            )
          ) : (
            <div className="grid aspect-video place-items-center p-6 text-center">
              <div>
                <p className="font-display text-2xl uppercase tracking-[.02em] text-cocoa">
                  Video coming soon
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  We&rsquo;re recording this walkthrough now. Check back shortly.
                </p>
              </div>
            </div>
          )}
        </div>

        <h2 className="mt-10 text-[.78rem] font-semibold uppercase tracking-[.16em] text-muted">
          More guides
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {others.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/dashboard/guides/${g.slug}`}
                className="block rounded-[18px] border border-cocoa/15 bg-white px-4 py-3 transition-colors hover:border-cocoa/40 hover:bg-butter-soft"
              >
                <span className="block text-sm font-semibold text-ink">{g.title}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{g.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
