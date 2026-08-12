import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
 testDir:"./tests/ai",fullyParallel:true,retries:process.env.CI?2:0,
 reporter:[["html",{outputFolder:"playwright-ai-report",open:"never"}],["list"]],
 use:{baseURL:process.env.AI_TEST_BASE_URL||"http://127.0.0.1:3000",trace:"retain-on-failure",screenshot:"only-on-failure",video:"retain-on-failure"},
 projects:[
  {name:"chromium",use:{...devices["Desktop Chrome"]}},
  {name:"firefox",use:{...devices["Desktop Firefox"]}},
  {name:"webkit",use:{...devices["Desktop Safari"]}},
  {name:"mobile-chrome",use:{...devices["Pixel 7"]}},
  {name:"mobile-safari",use:{...devices["iPhone 15"]}}
 ]});
