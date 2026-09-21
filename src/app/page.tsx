import type { Metadata } from "next";
import { auth } from "@/auth";
import BeeFlight from "@/components/BeeFlight";
import SiteHeader from "@/components/SiteHeader";
import Hero from "@/components/sections/Hero";
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

// Title and description are inherited from the root layout — this exists only to
// declare the canonical, which has to be set per page rather than once in the
// layout (a layout-level canonical is inherited verbatim, so every page would
// claim to be the homepage).
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <>
      {/* Scroll-reveal starts sections at opacity 0 and needs JS to lift it; with
          scripts off, show everything rather than a blank page. */}
      <noscript>
        <style>{`.reveal{opacity:1;transform:none;transition:none}`}</style>
      </noscript>
      <SiteHeader user={session?.user} />
      <BeeFlight />
      <main>
        <Hero signedIn={signedIn} />
        <PlatformStrip />
        <HowItWorks />
        <FeedbackSplit />
        <MidCta signedIn={signedIn} />
        <Journey />
        <PrivacyBadge />
        <Pricing signedIn={signedIn} />
        <Faq />
        <CtaBand signedIn={signedIn} />
      </main>
      <SiteFooter />
    </>
  );
}
