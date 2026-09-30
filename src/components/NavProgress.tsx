"use client";

// Thin bar across the top of the window while the next page loads, so every
// click on a link visibly does something. Starts on any same-origin link click
// (next/link or a plain <a>, like the redirects to Stripe and Google) and
// finishes when the URL changes. Plain <a> links leave the page anyway, so the
// bar simply runs until the browser swaps it out.

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Phase = "idle" | "loading" | "done";

/** Gives up quietly if a navigation never lands (e.g. the tab was cancelled). */
const GIVE_UP_MS = 20_000;

export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return;
      // Same page, or only the #hash differs: nothing will load.
      if (to.pathname === location.pathname && to.search === location.search) return;

      setPhase("loading");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase("idle"), GIVE_UP_MS);
    }
    // Back/forward from the bfcache restores the page mid-"loading".
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setPhase("idle");
    }
    document.addEventListener("click", onClick);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // The URL changed: the new page is here. Adjusted during render rather than
  // in an effect, so the bar never paints one extra frame at "loading".
  const url = `${pathname}?${search}`;
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) {
    setLastUrl(url);
    if (phase === "loading") setPhase("done");
  }

  useEffect(() => {
    if (phase !== "done") return;
    clearTimeout(timer.current);
    const t = setTimeout(() => setPhase("idle"), 400);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className="h-full bg-sky-deep shadow-[0_0_8px_rgba(47,93,124,.6)]"
        style={{
          width: phase === "idle" ? "0%" : phase === "loading" ? "85%" : "100%",
          opacity: phase === "idle" ? 0 : 1,
          // Creeps towards 85% while waiting, then snaps to full and fades.
          transition:
            phase === "loading"
              ? "width 8s cubic-bezier(.1,.7,.2,1), opacity .1s"
              : phase === "done"
                ? "width .2s ease-out, opacity .3s ease .2s"
                : "none",
        }}
      />
    </div>
  );
}
