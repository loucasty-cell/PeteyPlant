import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const url = process.argv[2] ?? process.env.PETEY_TEST_URL ?? 'http://localhost:3000';
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
  const firstPlant = page.getByRole('button', { name: 'Add your plant', exact: true });
  await firstPlant.waitFor();
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-garden-desktop.png'), fullPage: true });

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Home overflows at ${width}px`);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  const navigation = page.getByRole('navigation', { name: 'Primary mobile navigation' });
  const profileButton = page.getByRole('button', { name: 'Profile', exact: true });
  const nickname = page.getByLabel('Plant nickname');
  await firstPlant.click();
  await page.getByRole('textbox', { name: 'Search species' }).fill('Monstera deliciosa');
  await page.getByRole('button', { name: 'Monstera Monstera deliciosa', exact: true }).click();
  await nickname.fill('Window Monstera');
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page.reload();
  await firstPlant.click();
  assert.equal(await nickname.inputValue(), 'Window Monstera');
  assert(await page.getByRole('radio', { name: 'Yes', exact: true }).isChecked());
  await page.getByRole('button', { name: 'Save plant' }).click();
  await nickname.waitFor({ state: 'hidden' });

  await navigation.getByRole('button', { name: 'My Garden', exact: true }).click();
  await profileButton.click();
  const checkupButton = page.getByRole('button', { name: 'Update observations', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Window Monstera' });
  const nextStep = dialog.getByRole('button', { name: 'See next step' });
  const saveObservation = dialog.getByRole('button', { name: 'Save observation' });
  const history = page.getByRole('region', { name: 'Care & observation history' });
  const loggedWatering = history.getByText('Owner logged watering', { exact: true });
  await checkupButton.click();
  await dialog.getByRole('radio', { name: 'Wet or soggy' }).check();
  await nextStep.click();
  await dialog.getByRole('heading', { name: 'Hold off on watering' }).waitFor();
  const confirmRoute = '**/api/v1/garden/plants/*/assessments/*/confirm';
  await page.route(confirmRoute, (route) => route.abort(), { times: 1 });
  await saveObservation.click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByText('Observation saved.', { exact: true }).count(), 0);
  await saveObservation.click();
  await dialog.getByText('Observation saved.', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  await page.reload();
  await navigation.getByRole('button', { name: 'My Garden', exact: true }).click();
  await profileButton.click();
  await history.getByText('Reported wet potting mix', { exact: true }).waitFor();
  assert.equal(await history.getByRole('listitem').count(), 1);
  assert.equal(await loggedWatering.count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Begin watering', exact: true }).count(), 0);

  await checkupButton.click();
  await dialog.getByRole('radio', { name: 'Dry', exact: true }).check();
  await nextStep.click();
  await dialog.getByRole('heading', { name: 'Check below the surface' }).waitFor();
  await dialog.getByRole('button', { name: 'Answer follow-up' }).click();
  await dialog.getByRole('radio', { name: 'At the surface only' }).check();
  await nextStep.click();
  await dialog.getByRole('heading', { name: 'Check below the surface' }).waitFor();
  assert.equal(await dialog.getByRole('heading', { name: 'The mix is ready for watering' }).count(), 0);
  assert.equal(await history.locator('li').count(), 1);

  await dialog.getByRole('button', { name: 'Answer follow-up' }).click();
  await dialog.getByRole('radio', { name: 'At the depth described above' }).check();
  await nextStep.click();
  await dialog.getByRole('heading', { name: 'Look for standing water' }).waitFor();
  await dialog.getByRole('button', { name: 'Answer follow-up' }).click();
  await dialog.getByRole('radio', { name: 'I looked and saw none' }).check();
  await nextStep.click();
  await dialog.getByRole('heading', { name: 'The mix is ready for watering' }).waitFor();
  await saveObservation.click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  const expiryPage = await browser.newPage({
    viewport: { width: 375, height: 812 },
    storageState: await page.context().storageState(),
    reducedMotion: 'reduce',
  });
  try {
    await expiryPage.clock.install();
    await expiryPage.goto(url);
    await expiryPage.getByRole('navigation', { name: 'Primary mobile navigation' })
      .getByRole('button', { name: 'My Garden', exact: true }).click();
    await expiryPage.getByRole('button', { name: 'Profile', exact: true }).click();
    const begin = expiryPage.getByRole('button', { name: 'Begin watering', exact: true });
    await begin.waitFor();
    await expiryPage.clock.fastForward(25 * 60 * 60 * 1000);
    await begin.waitFor({ state: 'hidden' });
    await expiryPage.getByRole('button', { name: 'Open soil checkup', exact: true }).waitFor();
  } finally {
    await expiryPage.close();
  }

  const carePath = /\/api\/v1\/garden\/plants\/[^/]+\/care$/;
  let committedCare;
  let committedStatus;
  await page.route(carePath, async (route) => {
    committedCare = route.request().postDataJSON();
    committedStatus = (await route.fetch()).status();
    await route.abort();
  }, { times: 1 });
  await page.getByRole('button', { name: 'Begin watering', exact: true }).click();
  const confirmWatered = page.getByRole('button', { name: 'Confirm watered', exact: true });
  await confirmWatered.click();
  await page.getByRole('alert').waitFor();
  assert.equal(committedStatus, 200);
  assert.equal(committedCare.kind, 'watered');
  const [retry] = await Promise.all([
    page.waitForRequest((request) => request.method() === 'POST' && carePath.test(request.url())),
    confirmWatered.click(),
  ]);
  assert.deepEqual(retry.postDataJSON(), committedCare);
  await loggedWatering.waitFor();
  await page.reload();
  await navigation.getByRole('button', { name: 'My Garden', exact: true }).click();
  await profileButton.click();
  await loggedWatering.waitFor();
  assert.equal(await loggedWatering.count(), 1);
  assert.equal(await history.getByRole('listitem').count(), 3);

  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-care-mobile.png'), fullPage: true });

  await navigation.getByRole('button', { name: 'More', exact: true }).click();
  const roster = page.getByRole('region', { name: 'Botanical Companion Roster' });
  assert.equal(await roster.getByRole('article').count(), 8);
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-plant-pals-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open Plant Lab', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Petey Plant' }).waitFor();
  await page.getByText('Plant Lab · Synthetic experimental demo').waitFor();
  assert.deepEqual(errors, []);
  console.log('Garden browser journey passed. Checkup persisted wet soil, withheld advice for surface-only dryness, and a watering retry after a lost response produced one event.');
} finally {
  await browser.close();
}
