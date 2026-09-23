"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Whether the visitor is a signed-in tutor, found out in the browser rather than
// on the server. Calling auth() in the marketing page would read the session
// cookie and force a fresh render on every request; asking after hydration lets
// the page be built once and served static. Crawlers and most visitors are
// signed out, so that's what the HTML says — a signed-in tutor sees the
// dashboard links swap in a moment after load.

const SignedInContext = createContext(false);

export function SignedInProvider({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((session) => {
        if (live && session?.user) setSignedIn(true);
      })
      // A failed check just leaves the signed-out links up, which still work.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return <SignedInContext value={signedIn}>{children}</SignedInContext>;
}

export function useSignedIn(): boolean {
  return useContext(SignedInContext);
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  return useSignedIn() ? children : null;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  return useSignedIn() ? null : children;
}
