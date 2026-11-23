import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const url = process.argv[2] ?? process.env.PETEY_TEST_URL ?? 'http://localhost:5174';
const shots = process.argv[3] ?? process.env.PETEY_SCREENSHOTS;
const browser = await chromium.launch({
  channel: process.env.PETEY_BROWSER_CHANNEL,
  executablePath: process.argv[4] ?? process.env.PETEY_BROWSER_EXECUTABLE,
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const firstPlant = page.getByRole('button', { name: 'Add your first plant' });
  await firstPlant.waitFor();
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-garden-desktop.png'), fullPage: true });

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Home overflows at ${width}px`);
  }

  await page.getByRole('button', { name: 'Plant Pals', exact: true }).click();
  assert.equal(await page.locator('.garden-shelf li').count(), 8);
  await page.setViewportSize({ width: 375, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-plant-pals-mobile.png'), fullPage: true });

  await page.getByRole('button', { name: 'Add Monstera', exact: true }).click();
  await page.getByLabel('Plant name').fill('Window Monstera');
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page.reload();
  await page.getByRole('button', { name: 'Add your first plant' }).click();
  assert.equal(await page.getByLabel('Plant name').inputValue(), 'Window Monstera');
  assert(await page.getByRole('radio', { name: 'Yes', exact: true }).isChecked());
  await page.getByRole('button', { name: 'Save plant' }).click();
  await page.getByRole('heading', { name: 'Window Monstera' }).waitFor();
  await page.getByRole('button', { name: 'Still moist', exact: true }).click();
  await page.getByText('You reported that the mix is still moist.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Log watering', exact: true }).count(), 0);

  await page.getByText('Record another soil check', { exact: true }).click();
  await page.route('**/api/v1/garden/plants/*/care', (route) => route.abort());
  await page.getByRole('button', { name: 'Dry', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByText('Reported dry potting mix').count(), 0);
  await page.unroute('**/api/v1/garden/plants/*/care');
  await page.getByRole('button', { name: 'Dry', exact: true }).click();
  await page.getByRole('button', { name: 'Log watering', exact: true }).click();
  await page.getByText('Watering saved.', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /Window Monstera/ }).click();
  assert.equal(await page.getByText('Watering logged', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Reported moist potting mix', { exact: true }).count(), 1);
  assert(await page.getByText(/Estimated check/).isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-care-mobile.png'), fullPage: true });

  await page.getByRole('button', { name: 'My garden', exact: true }).first().click();
  await page.getByRole('button', { name: 'Plant Lab', exact: true }).click();
  await page.getByRole('button', { name: 'Back to my garden' }).waitFor();
  await page.getByText('Plant Lab · Demo data').waitFor();
  assert.deepEqual(errors, []);
  console.log('Garden browser journey passed at 320, 375, 768, 1024, and 1440px.');
} finally {
  await browser.close();
}
