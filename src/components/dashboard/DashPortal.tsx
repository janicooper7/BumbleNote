"use client";

import { createPortal } from "react-dom";
import { bnFontVars } from "@/components/bn/fonts";

/**
 * Portals a dashboard overlay to <body> while keeping the dashboard's look.
 * <body> sits outside the layout's `.theme-bn.theme-dash` wrapper, so a bare
 * portal falls back to the root tokens (honey yellow, navy ink, old fonts).
 * `display: contents` re-applies the theme's tokens and fonts without adding a
 * box — the wrapper's own background never paints.
 */
export default function DashPortal({ children }: { children: React.ReactNode }) {
  return createPortal(
    <div className={`theme-bn theme-dash ${bnFontVars} contents`}>{children}</div>,
    document.body,
  );
}
