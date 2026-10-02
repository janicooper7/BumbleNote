"use client";

// The browser side of cookie consent (formats in src/lib/tracking.ts): reading
// and storing the choice, and a tiny store so the banner, the Pixel and the
// attribution capture all react when it changes.

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  parseConsent,
  ATTRIBUTION_COOKIE,
  type ConsentChoice,
} from "@/lib/tracking";

const listeners = new Set<() => void>();

/** Fired by "Cookie settings" links to show the banner again. */
export const OPEN_SETTINGS_EVENT = "bn:cookie-settings";

export function subscribeConsent(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function writeCookie(name: string, value: string, maxAge: number): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  // The Pixel sets its cookies on the parent domain, so clear both forms.
  const host = location.hostname.replace(/^www\./, "");
  document.cookie = `${name}=; Path=/; Max-Age=0`;
  document.cookie = `${name}=; Path=/; Max-Age=0; Domain=.${host}`;
}

export function getConsent(): ConsentChoice | null {
  return parseConsent(readCookie(CONSENT_COOKIE));
}

export function setConsent(choice: ConsentChoice): void {
  const previous = getConsent();
  writeCookie(CONSENT_COOKIE, choice, CONSENT_MAX_AGE);
  if (choice === "essential" && previous === "marketing") {
    // Withdrawn: remove what marketing cookies left behind, and reload so the
    // Pixel, already running in this page, is gone too.
    for (const name of ["_fbp", "_fbc", ATTRIBUTION_COOKIE]) deleteCookie(name);
    location.reload();
    return;
  }
  listeners.forEach((cb) => cb());
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
