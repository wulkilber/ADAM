import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./test/browser',workers:1,timeout:45000,
  use:{baseURL:'http://localhost:3000',headless:true,viewport:{width:1440,height:1000},
    launchOptions:process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{},
    screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'npm run demo',url:'http://localhost:3000/healthz',reuseExistingServer:!process.env.CI,timeout:30000}
});
