// First-touch attribution and Meta's click id: what we capture from a landing
// URL, and that the cookie round-trips and rejects anything that isn't ours.

import { describe, expect, it } from "vitest";
import { attributionFromUrl, decodeAttribution, encodeAttribution, fbcFrom, parseConsent } from "./tracking";

const AD_URL = new URL(
  "https://bumblenote.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=launch&utm_content=video-a&utm_term=tutors&fbclid=IwAR123",
);

describe("attribution", () => {
  it("captures every UTM, the fbclid and the landing page", () => {
    const a = attributionFromUrl(AD_URL, 1_700_000_000_000);
    expect(a).toEqual({
      utm_source: "facebook",
      utm_medium: "paid_social",
      utm_campaign: "launch",
      utm_content: "video-a",
      utm_term: "tutors",
      fbclid: "IwAR123",
      landing_page: AD_URL.pathname + AD_URL.search,
      ts: 1_700_000_000_000,
    });
  });

  it("records a direct visit's landing page with no UTMs", () => {
    const a = attributionFromUrl(new URL("https://bumblenote.com/signup"), 1);
    expect(a.landing_page).toBe("/signup");
    expect(a.utm_source).toBeUndefined();
  });

  it("round-trips through the cookie", () => {
    const a = attributionFromUrl(AD_URL, 5);
    expect(decodeAttribution(encodeAttribution(a))).toEqual(a);
  });

  it("rejects cookies that aren't ours, and trims oversized values", () => {
    expect(decodeAttribution("not-json")).toBeNull();
    expect(decodeAttribution(encodeURIComponent(JSON.stringify({ utm_source: "x" })))).toBeNull();
    const long = decodeAttribution(encodeURIComponent(JSON.stringify({ ts: 1, utm_source: "a".repeat(999) })));
    expect(long?.utm_source).toHaveLength(200);
  });
});

describe("fbc", () => {
  it("prefers the Pixel's _fbc cookie", () => {
    expect(fbcFrom("fb.1.123.abc", attributionFromUrl(AD_URL, 9))).toBe("fb.1.123.abc");
  });

  it("builds one from the landing fbclid otherwise", () => {
    expect(fbcFrom(null, attributionFromUrl(AD_URL, 9))).toBe("fb.1.9.IwAR123");
    expect(fbcFrom(null, null)).toBeNull();
  });
});

describe("consent", () => {
  it("only recognises the two choices", () => {
    expect(parseConsent("marketing")).toBe("marketing");
    expect(parseConsent("essential")).toBe("essential");
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });
});
