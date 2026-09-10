import type { Metadata } from "next";
import { auth } from "@/auth";
import BeeFlight from "@/components/BeeFlight";
import SiteHeader from "@/components/SiteHeader";
import Hero from "@/components/sections/Hero";
import PlatformStrip from "@/components/sections/PlatformStrip";
import HowItWorks from "@/components/sections/HowItWorks";
import Transformation from "@/components/sections/Transformation";
import FeedbackSplit from "@/components/sections/FeedbackSplit";
import Journey from "@/components/sections/Journey";
import PrivacyBadge from "@/components/sections/PrivacyBadge";
import Pricing from "@/components/sections/Pricing";
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

  return (
    <>
      <SiteHeader user={session?.user} />
      <BeeFlight />
      <main>
        <Hero />
        <PlatformStrip />
        <HowItWorks />
        <Transformation />
        <FeedbackSplit />
        <Journey />
        <PrivacyBadge />
        <Pricing />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
