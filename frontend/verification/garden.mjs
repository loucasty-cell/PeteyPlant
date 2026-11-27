import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { SPECIES_ASSET_MANIFEST } from '../src/lib/three/speciesAssetRegistry.ts';

const url = process.argv[2] ?? process.env.PETEY_TEST_URL ?? 'http://localhost:3000';
const shots = process.argv[3] ?? process.env.PETEY_SCREENSHOTS;
const browser = await chromium.launch({
  channel: process.env.PETEY_BROWSER_CHANNEL,
  executablePath: process.argv[4] ?? process.env.PETEY_BROWSER_EXECUTABLE,
});
const errors = [];
try {
  const weatherPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    const lookup = /\/api\/weather\?lat=/;
    const startupLookup = /\/api\/weather\?lat=37\.7694/;
    await weatherPage.route(lookup, (route) => {
      if (startupLookup.test(route.request().url())) return;
      const city = new URL(route.request().url()).searchParams.get('lat');
      return city === '51.5072'
        ? route.fulfill({ json: { weatherCondition: { type: 'CLEAR' }, isDaytime: true, temperature: { degrees: 18 } } })
        : route.fulfill({ status: 503, json: { error: 'Weather fixture unavailable' } });
    });
    const startup = weatherPage.waitForRequest(startupLookup);
    await weatherPage.goto(url);
    await startup;
    const weatherTrigger = weatherPage.getByRole('button', { name: 'Outdoor weather atmosphere settings' });
    await weatherTrigger.click();
    const atmosphere = weatherPage.getByRole('dialog', { name: 'Outdoor weather atmosphere' });
    const sanFrancisco = atmosphere.getByRole('button', { name: 'San Francisco', exact: true });
    const london = atmosphere.getByRole('button', { name: 'London', exact: true });
    const tokyo = atmosphere.getByRole('button', { name: 'Tokyo', exact: true });
    assert.equal(await sanFrancisco.getAttribute('aria-pressed'), 'false');
    const cancelled = weatherPage.waitForEvent('requestfailed', (request) => startupLookup.test(request.url()));
    await atmosphere.getByRole('button', { name: 'Next biome' }).click();
    await cancelled;
    await atmosphere.getByRole('button', { name: 'Live GPS', exact: true }).waitFor();
    assert.equal((await weatherTrigger.innerText()).trim(), 'Preview');
    assert.equal(await atmosphere.locator('.weather-theme-card[aria-pressed="true"]').count(), 1);
    await london.click();
    await atmosphere.getByText(/^London · /).waitFor();
    assert.match(await weatherTrigger.innerText(), /18°C/);
    assert.equal(await london.getAttribute('aria-pressed'), 'true');
    await tokyo.click();
    await atmosphere.getByRole('alert').getByText(/Live weather for Tokyo is unavailable/).waitFor();
    assert.equal(await tokyo.getAttribute('aria-pressed'), 'false');
    assert.equal(await london.getAttribute('aria-pressed'), 'true');
    assert(await atmosphere.getByText(/^London · /).isVisible());
    await tokyo.focus();
    await weatherPage.keyboard.press('Escape');
    await atmosphere.waitFor({ state: 'hidden' });
    assert.equal(await weatherTrigger.evaluate((button) => button === document.activeElement), true);
  } finally {
    await weatherPage.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const firstPlant = page.getByRole('button', { name: 'Add your plant', exact: true });
  await firstPlant.waitFor();
  if (shots) {
    await page.locator('canvas[data-stage-model="monstera"]').waitFor();
    await page.screenshot({ path: resolve(shots, 'petey-garden-desktop.png'), fullPage: true });
  }

  for (const width of [320, 375, 390, 768, 1024, 1440]) {
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
  await page.locator('.profile-hero-left img[src*="monstera"]').waitFor();
  await page.getByRole('button', { name: 'Edit species & pot', exact: true }).click();
  await page.getByRole('spinbutton', { name: /Inner pot capacity/ }).fill('1.5');
  await page.getByRole('textbox', { name: 'Potting mix (optional)' }).fill('Bark and coir');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const potContext = page.getByRole('region', { name: 'Pot, substrate & environment' });
  await potContext.getByText(/^1[.,]5\s*[lL]$/).waitFor();
  await potContext.getByText('Bark and coir', { exact: true }).waitFor();
  await page.reload();
  await navigation.getByRole('button', { name: 'My Garden', exact: true }).click();
  await profileButton.click();
  await potContext.getByText(/^1[.,]5\s*[lL]$/).waitFor();
  await potContext.getByText('Bark and coir', { exact: true }).waitFor();
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
  await dialog.getByRole('button', { name: 'Answer follow-up' }).click();
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check();
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

  const conditions = page.getByRole('region', { name: 'Active assessed conditions' });
  await conditions.getByText('Standing water reported', { exact: true }).waitFor();
  await conditions.getByText('Wet potting mix reported', { exact: true }).waitFor();
  await conditions.getByText('Owner reported', { exact: true }).waitFor();
  await navigation.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: /Window Monstera says: You spotted water collecting/ }).waitFor();
  await page.getByText('Hold off on watering', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Begin watering', exact: true }).count(), 0);
  const holdPage = await browser.newPage({
    viewport: { width: 375, height: 812 },
    storageState: await page.context().storageState(),
    reducedMotion: 'reduce',
  });
  try {
    await holdPage.clock.install();
    await holdPage.goto(url);
    const holdLabel = holdPage.getByText('Hold off on watering', { exact: true });
    await holdLabel.waitFor();
    await holdPage.clock.fastForward(25 * 60 * 60 * 1000);
    await holdLabel.waitFor({ state: 'hidden' });
    await holdPage.getByRole('button', { name: 'Open soil checkup', exact: true }).waitFor();
    assert.equal(await holdPage.getByRole('button', { name: 'Begin watering', exact: true }).count(), 0);
  } finally {
    await holdPage.close();
  }
  await navigation.getByRole('button', { name: 'My Garden', exact: true }).click();
  await profileButton.click();

  await checkupButton.click();
  await dialog.getByRole('radio', { name: 'Dry', exact: true }).check();
  await nextStep.click();
  await dialog.getByRole('heading', { name: 'Hold off on watering' }).waitFor();
  await dialog.getByRole('button', { name: 'Answer follow-up' }).click();
  await dialog.getByRole('radio', { name: 'I looked and saw none' }).check();
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

  await navigation.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  const cart = page.getByRole('button', { name: /queued in Hydration Cart/ });
  await cart.waitFor();
  const cartStorageKey = 'petey-hydration-cart-v1';
  const savedCart = await page.evaluate((key) => sessionStorage.getItem(key), cartStorageKey);
  assert.equal(JSON.parse(savedCart).length, 1);
  const releasePlants = Promise.withResolvers();
  const plantsPath = /\/api\/v1\/garden\/plants$/;
  await page.route(plantsPath, async (route) => {
    await releasePlants.promise;
    await route.continue();
  }, { times: 1 });
  try {
    const loadingPlants = page.waitForRequest(plantsPath);
    await page.reload();
    await loadingPlants;
    await navigation.waitFor();
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), cartStorageKey), savedCart);
  } finally {
    releasePlants.resolve();
  }
  await cart.waitFor();
  await navigation.getByRole('button', { name: 'My Garden', exact: true }).click();
  await profileButton.click();

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
  assert.equal(await roster.getByRole('article').count(), SPECIES_ASSET_MANIFEST.length);
  assert.equal(await roster.locator('canvas').count(), 0, 'The shelf must not mount one canvas per model');
  assert.equal(await roster.locator('img[loading="lazy"]').count(), SPECIES_ASSET_MANIFEST.length);
  const rosterCard = roster.getByRole('article').first();
  const firstCompanion = SPECIES_ASSET_MANIFEST[0];
  assert(await rosterCard.getByText(firstCompanion.traitLabel, { exact: true }).isVisible());
  assert(await rosterCard.getByText(`3D: ${firstCompanion.assetStatus}`, { exact: true }).isVisible());
  await page.setViewportSize({ width: 1440, height: 900 });
  await rosterCard.hover();
  await page.waitForFunction(() => {
    const card = document.querySelector('[aria-labelledby="pals-catalog-heading"] article');
    return getComputedStyle(card).translate === '0px -2px';
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedCard = await rosterCard.evaluate(card => {
    const { translate, transitionProperty } = getComputedStyle(card);
    const portrait = getComputedStyle(card.querySelector('img'));
    return { translate, transitionProperty, scale: portrait.scale, portraitTransition: portrait.transitionProperty };
  });
  assert.deepEqual(reducedCard, {
    translate: 'none', transitionProperty: 'border-color, box-shadow', scale: 'none', portraitTransition: 'none',
  });
  for (const width of [1024, 768, 390, 320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Roster overflows at ${width}px`);
  }
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-plant-pals-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open Plant Lab', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Petey Plant' }).waitFor();
  await page.getByText('Plant Lab · Synthetic experimental demo').waitFor();
  assert.deepEqual(errors, []);
  console.log('Garden browser journey passed. Checkup persisted wet soil, withheld advice for surface-only dryness, and a watering retry after a lost response produced one event.');
} finally {
  await browser.close();
}
