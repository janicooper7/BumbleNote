"use client";

// The Pixel's ViewContent for a marketing page, once per visit to it. Does
// nothing without marketing consent (see ./pixel.ts).

import { useEffect, useSyncExternalStore } from "react";
import { getConsent, subscribeConsent } from "./consent";
import { track } from "./pixel";

const sent = new Set<string>();

export default function ViewContent({ name }: { name: string }) {
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => null);

  useEffect(() => {
    if (consent !== "marketing" || sent.has(name)) return;
    sent.add(name);
    track("ViewContent", { content_name: name, content_category: "marketing" });
  }, [consent, name]);

  useEffect(() => () => void sent.delete(name), [name]);

  return null;
}
