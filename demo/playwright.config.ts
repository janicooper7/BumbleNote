// Playwright config for the demo recordings — not a test suite.
//
//   npm run demo                      every scenario, one after another
//   npm run demo -- -g "review"       just the scenarios whose name matches
//   npm run demo:list                 list the scenarios
//
// Environment (all optional):
//   DEMO_BASE_URL   site to drive          (default http://localhost:3000)
//   DEMO_RESET=1    empty the demo account first (default: leave it as it is,
//                   since the takes build on each other)
//   DEMO_HEADLESS=1 run without a visible window (for checking the scripts)
//   DEMO_START      "enter" = wait for Enter in the browser before each take
//                   (default), or a number of seconds to wait instead
//   DEMO_KIOSK=1    full screen, no tabs or address bar
//   DEMO_VIDEO=1    also save a .webm of each take under demo/.output
//   DEMO_SPEED      pacing multiplier: 0.5 = twice as fast, 2 = twice as slow

import { defineConfig } from "@playwright/test";

const kiosk = process.env.DEMO_KIOSK === "1";
const video = process.env.DEMO_VIDEO === "1";
export const VIEWPORT = { width: 1440, height: 900 };

export default defineConfig({
  testDir: ".",
  testMatch: "scenarios.spec.ts",
  globalSetup: "./global-setup.ts",
  outputDir: "./.output",
  // One take at a time, in order, no retries: a retry would just replay on camera.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // No overall limit while a take waits on you to press Enter; each step still
  // fails fast (actionTimeout below) instead of hanging.
  timeout: (process.env.DEMO_START ?? "enter") === "enter" ? 0 : 5 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "http://localhost:3000",
    storageState: "demo/.auth/state.json",
    channel: "chrome",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    headless: process.env.DEMO_HEADLESS === "1",
    viewport: kiosk ? null : VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-GB",
    timezoneId: "Europe/London",
    colorScheme: "light",
    video: video ? { mode: "on", size: VIEWPORT } : "off",
    launchOptions: {
      // Drops the "Chrome is being controlled by automated test software" bar.
      ignoreDefaultArgs: ["--enable-automation"],
      args: kiosk
        ? ["--kiosk", "--disable-infobars", "--autoplay-policy=no-user-gesture-required"]
        : ["--autoplay-policy=no-user-gesture-required", `--window-size=${VIEWPORT.width},${VIEWPORT.height + 90}`, "--window-position=0,0", "--disable-infobars"],
    },
  },
});
