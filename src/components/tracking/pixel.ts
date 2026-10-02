"use client";

// The Meta Pixel, loaded only once the visitor has accepted marketing cookies.
// Every call goes through track(): it's a no-op without consent or without
// NEXT_PUBLIC_META_PIXEL_ID, and it loads the Pixel on first use.

import { getConsent } from "./consent";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: Fbq;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

let initialised = false;

/** Load and initialise the Pixel if allowed. Returns whether it's available. */
function ensurePixel(): boolean {
  if (!PIXEL_ID || typeof window === "undefined" || getConsent() !== "marketing") return false;
  if (initialised) return true;

  // Meta's standard loader: a queueing stub until fbevents.js arrives.
  if (!window.fbq) {
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  window.fbq("init", PIXEL_ID);
  initialised = true;
  return true;
}

/**
 * Send a standard or custom event. `eventId` is the id the server's
 * Conversions API copy uses, so Meta counts the two as one.
 */
export function track(name: string, params?: Record<string, unknown>, eventId?: string): void {
  if (!ensurePixel()) return;
  const standard = ["PageView", "ViewContent", "CompleteRegistration", "Subscribe", "Purchase"].includes(name);
  window.fbq!(standard ? "track" : "trackCustom", name, params ?? {}, eventId ? { eventID: eventId } : undefined);
}
