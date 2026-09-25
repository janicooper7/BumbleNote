// Unit tests for the pure logic in src/lib (run with `npm test`).
//
// Node environment: nothing under test renders React, and the modules that do
// need a browser (WebAudio decoding in lib/audio-trim) are tested only through
// their pure helpers.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // lib/env throws on a missing key the moment one is read, and a few modules
    // read theirs while building a client. Dummy values keep that path working
    // without ever pointing a test at a real service — every network client is
    // mocked in the tests that reach one. Vitest doesn't load .env.local into
    // process.env, so the real DATABASE_URL there is never seen.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      ANTHROPIC_API_KEY: "test",
      RESEND_API_KEY: "test",
      DEEPGRAM_API_KEY: "test",
      INTERNAL_TASK_SECRET: "test",
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_dummy",
    },
  },
});
