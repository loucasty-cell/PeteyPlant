import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { resolve } from 'node:path';

const url = process.argv[2] ?? process.env.PETEY_TEST_URL ?? 'http://localhost:5174';
const shots = process.argv[3] ?? process.env.PETEY_SCREENSHOTS;
const browser = await chromium.launch({
  channel: process.env.PETEY_BROWSER_CHANNEL,
  executablePath: process.argv[4] ?? process.env.PETEY_BROWSER_EXECUTABLE,
  args: ['--use-fake-device-for-media-stream'],
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
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflows at ${width}px`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
}

async function snapshot(page, name) {
  if (shots) await page.screenshot({ path: resolve(shots, name), fullPage: true });
}

async function openLens(page) {
  await page.getByRole('button', { name: 'Petey Lens', exact: true }).click();
  await page.getByRole('heading', { name: 'Meet your plant.' }).waitFor();
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
  await page.getByRole('button', { name: 'Add plant', exact: true }).waitFor();

  const [capabilityResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/lens/status') && response.ok()),
    openLens(page),
  ]);
  const capability = await capabilityResponse.json();
  assert(['available', 'unavailable'].includes(capability.status));
  if (capability.status === 'unavailable') {
    await page.getByText(capability.message, { exact: true }).waitFor();
    await page.locator('input[type=file]').setInputFiles(upload);
    await page.getByRole('img', { name: 'Your plant photo for review' }).waitFor();
    assert(await page.getByRole('button', { name: 'Use photo' }).isDisabled());
    await page.getByRole('button', { name: 'Search by plant name' }).click();
    await page.getByRole('heading', { name: 'Find your plant.' }).waitFor();
    await openLens(page);
  }
  await noOverflow(page);
  await snapshot(page, 'petey-lens-mobile.png');

  await page.getByRole('button', { name: 'Open camera' }).click();
  await page.getByRole('button', { name: 'Take photo' }).waitFor();
  await page.getByRole('button', { name: 'Take photo' }).click();
  await page.getByRole('img', { name: 'Your plant photo for review' }).waitFor();
  await page.waitForFunction(() => window.peteyTestStreams.length > 0
    && window.peteyTestStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')));
  await page.getByRole('button', { name: 'Retake photo' }).click();
  await page.getByRole('button', { name: 'Take photo' }).waitFor();
  await page.getByRole('button', { name: 'Plant health', exact: true }).click();
  await page.getByRole('heading', { name: 'What’s changed?' }).waitFor();
  await page.waitForFunction(() => window.peteyTestStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')));

  await noOverflow(page);
  await snapshot(page, 'petey-plant-health-mobile.png');
  await page.getByLabel('No visible issue').check();
  await page.getByLabel('Yellowing leaves').check();
  assert(!(await page.getByLabel('No visible issue').isChecked()));
  await page.getByLabel('What does the potting mix feel like?').selectOption('wet');
  await page.getByLabel('Does the inner pot have drainage holes?').selectOption('no');
  const triageResponse = page.waitForResponse((response) => response.url().includes('/plant-health/triage') && response.ok());
  await page.getByRole('button', { name: 'Get next steps' }).click();
  const advice = await (await triageResponse).json();
  assert.equal(advice.evidence_type, 'owner_observations');
  await page.getByRole('heading', { name: advice.headline }).waitFor();
  assert.equal(await page.getByRole('heading', { name: advice.headline }).evaluate((node) => node === document.activeElement), true);
  assert(advice.steps.length > 0);
  assert(await page.getByRole('heading', { name: 'Care sources' }).isVisible());
  await snapshot(page, 'petey-plant-health-result-mobile.png');
  await page.getByRole('button', { name: 'Edit observations' }).click();
  assert.equal(await page.getByLabel('What does the potting mix feel like?').inputValue(), 'wet');
  assert(await page.getByLabel('Yellowing leaves').isChecked());

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
  await page.getByRole('img', { name: 'Your plant photo for review' }).waitFor();
  assert.equal(scans, 0);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(scans, 1);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await page.getByRole('heading', { name: 'Possible matches.' }).waitFor();
  assert.equal(scans, 2);
  await page.getByRole('button', { name: 'Compare leaf and stem features' }).click();
  await page.getByRole('heading', { name: 'Compare your matches.' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'NC State Extension plant guide' }).count(), 2);
  await page.getByRole('button', { name: 'Possible matches', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Monstera' }).click();
  await page.getByRole('button', { name: 'Set up this plant' }).click();
  await page.getByRole('heading', { name: 'Make it yours.' }).waitFor();
  await page.getByLabel('Plant name').fill('Lens Monstera');
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page.getByRole('button', { name: 'Save plant' }).click();
  await page.getByRole('heading', { name: 'Lens Monstera' }).waitFor();
  await page.getByRole('button', { name: 'Check plant health' }).click();
  await page.getByRole('heading', { name: 'How’s Lens Monstera?' }).waitFor();
  assert.equal(await page.getByLabel('Does the inner pot have drainage holes?').inputValue(), 'yes');
  await page.getByRole('button', { name: 'Back to Lens Monstera' }).click();
  await page.getByRole('heading', { name: 'Lens Monstera' }).waitFor();

  assert.deepEqual(errors, []);
  console.log('Plant tools journey passed with real triage, isolated camera, and stubbed future model matches.');
} finally {
  await browser.close();
}
