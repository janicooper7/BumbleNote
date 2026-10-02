"use client";

// Everything ad tracking does in the browser, mounted once in the root layout:
//
//   - the consent banner (until the visitor chooses, and again from "Cookie settings")
//   - first-touch attribution: the landing URL's UTMs and fbclid, held in memory
//     and written to the bn_attr cookie only once marketing cookies are accepted
//   - the Pixel's PageView on every route change, App Router included
//   - the browser copy of CompleteRegistration, with the server's event id
//
// Nothing here sets a non-essential cookie or loads the Pixel before consent.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  attributionFromUrl,
  encodeAttribution,
  REGISTRATION_EVENT_COOKIE,
  type Attribution,
} from "@/lib/tracking";
import ConsentBanner from "./ConsentBanner";
import { getConsent, readCookie, subscribeConsent, writeCookie } from "./consent";
import { track } from "./pixel";

/** The page this visit landed on, captured before any client-side navigation. */
let landing: Attribution | null = null;

function saveAttribution(): void {
  if (!landing || readCookie(ATTRIBUTION_COOKIE)) return; // first touch wins
  writeCookie(ATTRIBUTION_COOKIE, encodeAttribution(landing), ATTRIBUTION_MAX_AGE);
}

/** The Pixel's half of CompleteRegistration, if the server just created an account. */
function sendPendingRegistration(): void {
  const eventId = readCookie(REGISTRATION_EVENT_COOKIE);
  if (!eventId) return;
  document.cookie = `${REGISTRATION_EVENT_COOKIE}=; Path=/; Max-Age=0`;
  track("CompleteRegistration", {}, decodeURIComponent(eventId));
}

export default function Tracking() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => null);
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!landing) landing = attributionFromUrl(new URL(window.location.href));
  }, []);

  useEffect(() => {
    if (consent !== "marketing") return;
    saveAttribution();
    // Once per path: React may run effects twice, and a consent change on the
    // same page shouldn't count a second view.
    if (lastTracked.current !== pathname) {
      lastTracked.current = pathname;
      track("PageView");
    }
    sendPendingRegistration();
  }, [consent, pathname]);

  return <ConsentBanner />;
}
