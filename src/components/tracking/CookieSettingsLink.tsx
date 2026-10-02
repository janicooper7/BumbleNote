"use client";

// "Cookie settings": reopens the consent banner (src/components/tracking/ConsentBanner.tsx).

import { openCookieSettings } from "./consent";

export default function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      Cookie settings
    </button>
  );
}
