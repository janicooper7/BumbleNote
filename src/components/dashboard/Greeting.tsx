"use client";

import { useSyncExternalStore } from "react";

// The server runs in UTC, so the time of day has to come from the viewer's
// browser clock, which follows their own time zone.
function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

const subscribe = () => () => {};

export default function Greeting({ name }: { name: string }) {
  // null on the server and during hydration, the local greeting right after.
  const greeting = useSyncExternalStore(
    subscribe,
    () => greetingFor(new Date().getHours()),
    () => null,
  );

  return <>{`${greeting ?? "Hello"}, ${name}`}</>;
}
