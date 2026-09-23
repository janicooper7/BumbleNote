import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import PrivacyNotice from "@/components/PrivacyNotice";
import { SITE_URL } from "@/lib/app-url";
import { gateEnabled } from "@/lib/site-gate";
import { SITE_DESCRIPTION as DESCRIPTION, SITE_TITLE as TITLE } from "@/lib/site-meta";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  // Without metadataBase, every relative URL below (the canonical link and the
  // generated opengraph-image) resolves against localhost at build time and the
  // social cards break in production.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // Pages that set a bare title get the product name appended; the ones that
    // already spell out "· BumbleNote" set an absolute title instead.
    template: "%s · BumbleNote",
  },
  description: DESCRIPTION,
  applicationName: "BumbleNote",
  // Belt-and-braces alongside robots.ts: while the pre-launch gate is up, any
  // page that does leak out carries its own noindex, so a crawler that ignores
  // robots.txt still can't put us in an index before launch.
  robots: gateEnabled()
    ? { index: false, follow: false }
    : { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "BumbleNote",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // en-GB to match the en_GB Open Graph locale: a UK business, UK spelling.
    <html lang="en-GB" className={`${fraunces.variable} ${hanken.variable}`}>
      <body>
        {children}
        <PrivacyNotice />
      </body>
    </html>
  );
}
