import type { Metadata } from "next";
import BeeFlight from "@/components/BeeFlight";
import SiteHeader from "@/components/SiteHeader";
import Hero from "@/components/sections/Hero";
import DailyNote from "@/components/sections/DailyNote";
import PlatformStrip from "@/components/sections/PlatformStrip";
import HowItWorks from "@/components/sections/HowItWorks";
import FeedbackSplit from "@/components/sections/FeedbackSplit";
import MidCta from "@/components/sections/MidCta";
import Journey from "@/components/sections/Journey";
import PrivacyBadge from "@/components/sections/PrivacyBadge";
import Pricing from "@/components/sections/Pricing";
import Faq from "@/components/sections/Faq";
import CtaBand from "@/components/sections/CtaBand";
import SiteFooter from "@/components/sections/SiteFooter";
import { bnFontVars } from "@/components/bn/fonts";
import JsonLd from "@/components/JsonLd";
import { SignedInProvider } from "@/components/SignedIn";
import { faqStructuredData, homepageStructuredData } from "@/lib/structured-data";

// Title and description are inherited from the root layout — this exists only to
// declare the canonical, which has to be set per page rather than once in the
// layout (a layout-level canonical is inherited verbatim, so every page would
// claim to be the homepage).
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// No auth() here: reading the session would render this page per request. The
// signed-in variations are worked out client-side by SignedInProvider, so the
// page is built once and served static.
export default function Home() {
  return (
    // The marketing page wears the template-pack look (brown / butter / blue,
    // Gilda + Pinyon + Jost); see .theme-bn in globals.css.
    <SignedInProvider>
      <div className={`theme-bn ${bnFontVars}`}>
        <JsonLd data={homepageStructuredData} />
        <JsonLd data={faqStructuredData} />
        {/* Scroll-reveal starts sections at opacity 0 and needs JS to lift it; with
            scripts off, show everything rather than a blank page. */}
        <noscript>
          <style>{`.reveal{opacity:1;transform:none;transition:none}`}</style>
        </noscript>
        <SiteHeader />
        <BeeFlight />
        <main>
          <Hero />
          <DailyNote />
          <PlatformStrip />
          <HowItWorks />
          <FeedbackSplit />
          <MidCta />
          <Journey />
          <PrivacyBadge />
          <Pricing />
          <Faq />
          <CtaBand />
        </main>
        <SiteFooter />
      </div>
    </SignedInProvider>
  );
}
