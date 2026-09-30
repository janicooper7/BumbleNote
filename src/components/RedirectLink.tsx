"use client";

// A plain <a> to a route that redirects off-site (Stripe Checkout and the
// billing portal). Those take a second or two to create, so once clicked the
// link shows a spinner and ignores further clicks — a double click would
// otherwise open two Checkout sessions.

import { useEffect, useState } from "react";
import Spinner from "./Spinner";

export default function RedirectLink({
  href,
  children,
  className = "",
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [pending, setPending] = useState(false);

  // Coming back with the browser's Back button can restore this page from the
  // bfcache with the spinner still showing.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <a
      {...rest}
      href={href}
      aria-busy={pending}
      onClick={(e) => {
        if (pending) return e.preventDefault();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        setPending(true);
      }}
      className={`${className} ${pending ? "cursor-wait opacity-80" : ""}`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner />
          {children}
        </span>
      ) : (
        children
      )}
    </a>
  );
}
