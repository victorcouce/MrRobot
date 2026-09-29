import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "MRROBOT_MOCK=1 MRROBOT_PORT=4000 npx tsx src/api/index.ts",
      cwd: "..",
      url: "http://127.0.0.1:4000/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "NEXT_PUBLIC_API_URL=http://127.0.0.1:4000 npm run dev",
      cwd: ".",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
