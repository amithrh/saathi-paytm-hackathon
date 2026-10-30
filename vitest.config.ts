import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["backend/test/**/*.test.ts", "agent/test/**/*.test.ts", "voice/test/**/*.test.ts", "twilio/test/**/*.test.ts", "server/test/**/*.test.ts"],
    exclude: process.env.LIVE ? [] : ["**/live-*.test.ts"],
    testTimeout: 20000,
  },
});
