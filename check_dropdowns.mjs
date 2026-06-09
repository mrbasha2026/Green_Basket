import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

const baseUrl = 'http://localhost:5175';
const pages = [
  { path: '/', name: 'Dashboard' },
  { path: '/sales', name: 'Sales' },
  { path: '/purchases', name: 'Purchases' },
  { path: '/inventory', name: 'Inventory' },
  { path: '/waste', name: 'Waste' },
  { path: '/reports', name: 'Reports' },
  { path: '/settings', name: 'Settings' },
  { path: '/customers', name: 'Customers' },
];

for (const p of pages) {
  await page.goto(baseUrl + p.path, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `screen_${p.name}.png`, fullPage: false });
  console.log(`Captured: ${p.name}`);
}

await browser.close();
console.log('Done');
