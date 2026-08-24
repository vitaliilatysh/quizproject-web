import { defineConfig, devices } from "@playwright/test";

const webBaseUrl = process.env.E2E_WEB_URL || "http://127.0.0.1:4173";
const apiBaseUrl = process.env.E2E_API_URL || webBaseUrl;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webBaseUrl,
    storageState: {
      cookies: [],
      origins: [{
        origin: webBaseUrl,
        localStorage: [{ name: "quizproject.apiUrl", value: apiBaseUrl }]
      }]
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev",
    url: webBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
