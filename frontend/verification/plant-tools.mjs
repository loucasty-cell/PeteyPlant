import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { resolve } from 'node:path';

const url = process.argv[2] ?? process.env.PETEY_TEST_URL ?? 'http://127.0.0.1:3000';
const shots = process.argv[3] ?? process.env.PETEY_SCREENSHOTS;
const browser = await chromium.launch({
  channel: process.env.PETEY_BROWSER_CHANNEL,
  executablePath: process.argv[4] ?? process.env.PETEY_BROWSER_EXECUTABLE,
  args: ['--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'],
});

const fixture = new PNG({ width: 240, height: 288 });
for (let index = 0; index < fixture.data.length; index += 4) {
  fixture.data[index] = (index / 4) % 240 < 120 ? 32 : 92;
  fixture.data[index + 1] = 117;
  fixture.data[index + 2] = 73;
  fixture.data[index + 3] = 255;
}
const upload = { name: 'photograph.png', mimeType: 'image/png', buffer: PNG.sync.write(fixture) };
const errors = [];
const versions = { model_version: 'test-fixture', taxonomy_version: 'test-taxonomy' };

async function noOverflow(page) {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflows at ${width}px`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
}

async function snapshot(page, name) {
  if (shots) await page.screenshot({ path: resolve(shots, name), fullPage: true });
}

async function openLens(page) {
  await page.getByRole('button', { name: 'Open Petey Lens camera identification', exact: true }).click();
  await page.getByRole('heading', { name: 'Identify a plant' }).waitFor();
}

try {
  const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 375, height: 812 } });
  await context.addInitScript(() => {
    const devices = navigator.mediaDevices;
    if (!devices) return;
    const getUserMedia = devices.getUserMedia.bind(devices);
    window.peteyTestStreams = [];
    devices.getUserMedia = async (options) => {
      const stream = await getUserMedia(options);
      window.peteyTestStreams.push(stream);
      return stream;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);

  const [capabilityResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/lens/status') && response.ok()),
    openLens(page),
  ]);
  const capability = await capabilityResponse.json();
  assert(['available', 'unavailable'].includes(capability.status));
  if (capability.status === 'unavailable') {
    await page.getByText(capability.message, { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Open camera' }).isDisabled());
    assert(await page.getByRole('button', { name: 'Upload photo' }).isDisabled());
    const manualPrimary = page.getByRole('button', { name: 'Search by plant name' });
    assert(!(await manualPrimary.isDisabled()));
    await noOverflow(page);
    await snapshot(page, 'petey-lens-mobile.png');
    await manualPrimary.click();
    await page.getByRole('heading', { name: 'Choose your plant species' }).waitFor();
  } else {
    await noOverflow(page);
    await snapshot(page, 'petey-lens-mobile.png');
  }

  await page.route('**/api/v1/lens/status', (route) => route.fulfill({ json: { ...versions, status: 'available', message: 'Test model adapter ready.' } }));
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/lens/status') && response.ok()),
    openLens(page),
  ]);
  await page.getByRole('button', { name: 'Open camera' }).click();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  await page.getByRole('button', { name: 'Capture plant photo' }).click();
  await page.getByRole('img', { name: 'Captured plant photo ready for review' }).waitFor();
  await page.waitForFunction(() => window.peteyTestStreams.length > 0
    && window.peteyTestStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')));
  await page.getByRole('button', { name: 'Retake photo' }).click();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  const navigation = page.getByRole('navigation', { name: 'Primary mobile navigation' });
  await navigation.getByRole('button', { name: 'More', exact: true }).click();
  const startHealth = page.getByRole('button', { name: 'Start condition check' });
  await startHealth.click();
  const health = page.getByRole('dialog');
  await health.getByRole('heading', { name: 'Plant condition check' }).waitFor();
  const nextStep = (label) => health.getByRole('button', { name: `Next: ${label}`, exact: true }).click();
  await page.waitForFunction(() => window.peteyTestStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')));

  await noOverflow(page);
  await snapshot(page, 'petey-plant-health-mobile.png');
  await nextStep('Watering & soil');
  const wetSoil = health.getByRole('radio', { name: /Very wet or soggy/ });
  await wetSoil.check();
  await health.getByRole('radio', { name: 'No drainage holes' }).check();
  await nextStep('Plant condition');
  const healthy = health.getByRole('checkbox', { name: 'No visible issue' });
  const yellowing = health.getByRole('checkbox', { name: 'Yellowing leaves' });
  await healthy.check();
  await yellowing.check();
  assert(!(await healthy.isChecked()));
  await nextStep('Additional context');
  const triageResponse = page.waitForResponse((response) => response.url().includes('/plant-health/triage') && response.ok());
  await page.getByRole('button', { name: 'Get practical next steps' }).click();
  const advice = await (await triageResponse).json();
  assert.equal(advice.evidence_type, 'owner_observations');
  await page.getByRole('heading', { name: advice.headline }).waitFor();
  assert.equal(await page.getByRole('heading', { name: advice.headline }).evaluate((node) => node === document.activeElement), true);
  assert(advice.steps.length > 0);
  assert(await page.getByRole('heading', { name: 'Verified horticultural sources' }).isVisible());
  await snapshot(page, 'petey-plant-health-result-mobile.png');
  await page.getByRole('button', { name: 'Edit observations' }).click();
  await nextStep('Watering & soil');
  assert(await wetSoil.isChecked());
  await nextStep('Plant condition');
  assert(await yellowing.isChecked());
  await health.getByRole('button', { name: 'Close plant condition check' }).click();

  await page.route('**/api/v1/lens/status', (route) => route.fulfill({ json: { ...versions, status: 'available', message: 'Test model adapter ready.' } }));
  let scans = 0;
  await page.route('**/api/v1/lens/identify', async (route) => {
    scans += 1;
    assert.equal(route.request().headers()['content-type'], 'image/jpeg');
    assert.equal(route.request().postDataBuffer()?.readUInt16BE(0), 0xffd8);
    if (scans === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({ json: {
      ...versions,
      request_id: 'fixture',
      status: 'possible_matches',
      candidates: [
        { species_key: 'Monstera deliciosa', original_label: 'Monstera deliciosa', scientific_name: 'Monstera deliciosa', common_name: 'Monstera', taxonomic_rank: 'species', confidence: null },
        { species_key: 'Epipremnum aureum', original_label: 'Epipremnum aureum', scientific_name: 'Epipremnum aureum', common_name: 'Golden Pothos', taxonomic_rank: 'species', confidence: null },
      ],
      another_photo_recommended: true,
      limitations: ['Suggestions depend on the visible leaf and stem features.'],
      fallback_used: false,
    } });
  });

  await openLens(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'not-a-photo.png', mimeType: 'image/png', buffer: Buffer.from('test') });
  await page.getByText('This image couldn’t be opened.', { exact: false }).waitFor();
  await page.locator('input[type=file]').setInputFiles(upload);
  await page.getByRole('img', { name: 'Captured plant photo ready for review' }).waitFor();
  assert.equal(scans, 0);
  await page.getByRole('button', { name: 'Identify plant' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(scans, 1);
  await page.getByRole('button', { name: 'Identify plant' }).click();
  await page.getByRole('heading', { name: 'Possible species matches' }).waitFor();
  assert.equal(scans, 2);
  await page.getByRole('button', { name: 'Compare leaf & stem features' }).click();
  await page.getByRole('heading', { name: 'Compare botanical traits' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'NC State Extension reference' }).count(), 2);
  await page.getByRole('button', { name: 'Possible matches', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Monstera' }).click();
  await page.getByRole('heading', { name: 'Confirm your companion' }).waitFor();
  await page.locator('canvas[data-stage-model="monstera"]').waitFor();
  await page.getByRole('button', { name: 'Rotate companion right' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const confirmPlant = page.getByRole('button', { name: 'Add to my garden' });
  const [confirmBounds, navBounds] = await Promise.all([confirmPlant.boundingBox(), navigation.boundingBox()]);
  assert(confirmBounds && navBounds && confirmBounds.y + confirmBounds.height <= navBounds.y,
    'Confirming the plant should be possible above the mobile navigation without scrolling');
  if (shots) await page.screenshot({ path: resolve(shots, 'petey-lens-confirm-mobile.png') });
  await confirmPlant.click();
  await page.getByRole('heading', { name: 'Name your plant' }).waitFor();
  await page.getByLabel('Plant nickname').fill('Lens Monstera');
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  const saved = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/garden/plants') && response.request().method() === 'POST' && response.ok());
  await page.getByRole('button', { name: 'Save plant' }).click();
  const plant = await (await saved).json();
  assert.equal(plant.species_id, 'Monstera deliciosa');
  assert.equal(plant.drainage, 'yes');
  await page.getByRole('heading', { name: 'Lens Monstera' }).waitFor();
  await navigation.getByRole('button', { name: 'More', exact: true }).click();
  await startHealth.click();
  await health.getByRole('heading', { name: 'Check on Lens Monstera' }).waitFor();
  await nextStep('Watering & soil');
  assert(await health.getByRole('radio', { name: 'Yes, it has drainage holes' }).isChecked());
  await page.keyboard.press('Escape');
  await health.waitFor({ state: 'hidden' });
  await navigation.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('heading', { name: 'Lens Monstera' }).waitFor();

  assert.deepEqual(errors, []);
  console.log('Plant tools journey passed with real triage, isolated camera, and stubbed future model matches.');
} finally {
  await browser.close();
}
