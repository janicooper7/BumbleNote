// 404. Reached most often from a stale link to a lesson or student that has since
// been deleted, so the copy avoids blaming the visitor for a bad URL.

import type { Metadata } from "next";
import StatusPage, { StatusPrimary, StatusSecondary } from "@/components/StatusPage";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <StatusPage
      eyebrow="404"
      title="This page has flown off"
      body="The link may be out of date, or whatever lived here has since been deleted. Nothing is wrong with your account."
    >
      <StatusPrimary href="/dashboard">Go to your dashboard</StatusPrimary>
      <StatusSecondary href="/">Back to the site</StatusSecondary>
    </StatusPage>
  );
}
