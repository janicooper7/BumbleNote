// Renders public/guides/poster.png: the BumbleNote lockup centred on the
// dashboard's soft-sky background, shown on each guide video before it plays.
//   node demo/poster.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const logo = readFileSync("public/logo-lockup.png").toString("base64");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(`
  <body style="margin:0;height:100vh;display:grid;place-items:center;
    background:radial-gradient(circle at 50% 45%, #fff7d9 0%, #e4eff5 70%)">
    <img src="data:image/png;base64,${logo}" style="width:420px">
  </body>`);
await page.screenshot({ path: "public/guides/poster.png" });
await browser.close();
console.log("public/guides/poster.png");
