// Print the /admin/growth numbers as JSON. It feeds the "Bumblenote Growth"
// artifact dashboard, which can't reach the database itself.
//
//   npx tsx scripts/growth-stats.ts
//
// Reads .env.local. Point DATABASE_URL at production to see real numbers.
// What's counted, and how, is in src/lib/growth-stats.ts.

import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  // Imported after dotenv so env-reading modules see the values.
  const { getGrowthStats } = await import("../src/lib/growth-stats");
  console.log(JSON.stringify(await getGrowthStats(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
