import { defineConfig } from "@playwright/test";

const port = 3116;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  expect: { timeout: 12_000 },
  fullyParallel: false,
  reporter: "line",
  retries: 0,
  testDir: "./tests/e2e",
  timeout: 90_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/campaign/campaign-japan-social`,
  },
  workers: 1,
});
