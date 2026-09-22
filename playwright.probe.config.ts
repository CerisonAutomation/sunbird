import { defineConfig, devices } from "@playwright/test";

// Temporary probe config: the default :4173 is occupied by a leftover preview
// server from a different checkout, so probe against our own fresh build on a
// free port instead of reusing (and being fooled by) that stale bundle.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4187",
    launchOptions: { args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
