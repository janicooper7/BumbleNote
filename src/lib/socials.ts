// Where we post. Read by the site footer, the waitlist emails and the homepage
// structured data (as the organisation's sameAs), so a new or renamed account is
// a one-line change here.

export type Social = { name: "Instagram" | "TikTok"; url: string };

export const SOCIAL_LINKS: Social[] = [
  { name: "Instagram", url: "https://www.instagram.com/bumblenote_" },
  { name: "TikTok", url: "https://www.tiktok.com/@bumblenote" },
];
