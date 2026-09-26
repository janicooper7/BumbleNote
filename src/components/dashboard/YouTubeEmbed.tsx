"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * A YouTube video that loads nothing from YouTube until it's clicked: just the
 * thumbnail and a play button. The real player (~1MB of script, plus cookies)
 * only arrives on click, and comes from youtube-nocookie.com so no tracking
 * cookies are set until the viewer actually plays.
 */
export default function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  // maxresdefault only exists for HD uploads; fall back to the always-present
  // hqdefault if it 404s.
  const [thumb, setThumb] = useState<"maxresdefault" | "hqdefault">("maxresdefault");

  if (playing) {
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0", // end-of-video suggestions from our channel only
      modestbranding: "1",
      playsinline: "1",
    });
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
        title={title}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        // YouTube refuses to play embeds that arrive with no referrer.
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video w-full bg-black"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      className="group relative block aspect-video w-full cursor-pointer bg-black"
    >
      <Image
        src={`https://i.ytimg.com/vi/${id}/${thumb}.jpg`}
        alt=""
        fill
        sizes="(min-width: 896px) 896px, 100vw"
        onError={() => setThumb("hqdefault")}
        className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-butter shadow-lg transition-transform group-hover:scale-110 group-focus-visible:scale-110">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-1 h-7 w-7 fill-cocoa">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.93-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
        </svg>
      </span>
    </button>
  );
}
