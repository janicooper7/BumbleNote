// Runs once before the takes: empties the demo account only if DEMO_RESET=1,
// then signs in headlessly — through the site gate if it's up — and saves the
// cookies, so every take opens already signed in with nothing off-script on camera.

import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CURSOR_SCRIPT } from "./director";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "./seed";

export default async function globalSetup(config: FullConfig) {
  if (process.env.DEMO_RESET === "1") {
    const r = await seedDemo();
    console.log(`\n  Demo data reset: ${r.students} students, ${r.lessons} lessons for ${r.email}`);
  }

  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ baseURL });
  await page.addInitScript(CURSOR_SCRIPT);

  try {
    await page.goto("/login");
  } catch {
    throw new Error(`Can't reach ${baseURL} — start the app first (npm run dev), or set DEMO_BASE_URL.`);
  }

  if (new URL(page.url()).pathname === "/enter") {
    const sitePassword = process.env.SITE_PASSWORD;
    if (!sitePassword) throw new Error("The site gate is up but SITE_PASSWORD isn't in .env.local.");
    // The password field sits in a collapsed <details> in the footer.
    await page.getByText("Have an early-access password?").click();
    await page.locator('input[name="password"]').fill(sitePassword);
    await page.locator('form:has(input[name="password"]) button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname !== "/enter");
    await page.goto("/login");
  }

  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  mkdirSync("demo/.auth", { recursive: true });
  await page.context().storageState({ path: "demo/.auth/state.json" });
  await browser.close();
  console.log(`  Signed in as ${DEMO_EMAIL}\n`);
}
