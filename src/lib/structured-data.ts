// Schema.org structured data for the homepage, rendered by <JsonLd>.
//
// Everything is derived from the modules the product itself reads — prices and
// limits from billing and quota, the FAQ from the same list the page renders —
// so what search engines are told can't drift from what a visitor sees or
// checkout charges.

import { FAQS } from "./faq";
import { SITE_URL } from "./app-url";
import { PLANS } from "./plans";
import { PAID_PLAN_IDS, PLAN_PRICES_USD } from "./pricing";
import { SITE_DESCRIPTION } from "./site-meta";

const ORG_ID = `${SITE_URL}/#organization`;

/** Who publishes the site, the site itself, and the product with its real prices. */
export const homepageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "BumbleNote",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
    },
    {
      "@type": "WebSite",
      name: "BumbleNote",
      url: SITE_URL,
      publisher: { "@id": ORG_ID },
    },
    {
      "@type": "SoftwareApplication",
      name: "BumbleNote",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web browser (desktop Chrome or Edge)",
      publisher: { "@id": ORG_ID },
      offers: [
        {
          "@type": "Offer",
          name: "Free trial",
          description: `${PLANS.free.students} student, ${PLANS.free.lessons} lessons, no card required`,
          price: 0,
          priceCurrency: "USD",
        },
        ...PAID_PLAN_IDS.map((id) => ({
          "@type": "Offer",
          name: PLANS[id].name,
          description: `Up to ${PLANS[id].lessons} lessons a month`,
          price: PLAN_PRICES_USD[id].month,
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: PLAN_PRICES_USD[id].month,
            priceCurrency: "USD",
            billingDuration: "P1M",
          },
        })),
      ],
    },
  ],
};

/**
 * The homepage FAQ. Google now shows FAQ rich results only for a few
 * authoritative sites, but the markup is still read by other engines and by AI
 * search, and costs nothing.
 */
export const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};
