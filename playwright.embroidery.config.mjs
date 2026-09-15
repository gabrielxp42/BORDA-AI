import {defineConfig} from '@playwright/test';
import fs from 'node:fs';
const chrome = process.env.EMBROIDERY_BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
export default defineConfig({
  testDir:'./tests/browser',testMatch:'*.spec.mjs',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:5181',headless:true,locale:'pt-BR',viewport:{width:1366,height:1000},launchOptions: chrome && fs.existsSync(chrome) ? {executablePath:chrome} : {},screenshot:'only-on-failure'},
  webServer:{command:'node scripts/serve-embroidery-tests.mjs',url:'http://127.0.0.1:5181',reuseExistingServer:true,timeout:90000},
});
