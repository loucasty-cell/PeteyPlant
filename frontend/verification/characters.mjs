import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { FLAGSHIP_SPECIES_MANIFEST } from '../src/lib/three/speciesAssetRegistry.ts';

const url = process.argv[2] ?? process.env.PETEY_TEST_URL ?? 'http://127.0.0.1:3000';
const shots = process.argv[3];
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PETEY_BROWSER_CHANNEL,
  executablePath: process.env.PETEY_BROWSER_EXECUTABLE,
  args: ['--enable-unsafe-swiftshader'],
});
const authoredSpecies = FLAGSHIP_SPECIES_MANIFEST.filter(entry => entry.assetStatus === 'authored');
const errors = [];
const plants = authoredSpecies.map(entry => ({
  id: `stage-${entry.assetId}`,
  name: `Test ${entry.commonName}`,
  species_id: entry.speciesId,
  common_name: entry.commonName,
  drainage: 'yes',
  status: 'check',
  message: 'Check the potting mix.',
  check_prompt: 'Check below the surface.',
  next_check_at: null,
  watering_guidance: null,
  watering_source: null,
  history: [],
}));

async function open(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('petey-selected-plant-v1', 'stage-monstera'));
  await page.route('**/api/v1/garden/plants', route => route.fulfill({ json: plants }));
  return page;
}

const canvas = (page, model) => page.locator(`canvas[data-stage-model="${model}"]`);
const shot = (page, name) => shots && page.locator('.companion-stage').screenshot({ path: resolve(shots, `${name}.png`) });
async function choose(page, label) {
  await page.locator('.lv-plant-switcher-btn').click();
  await page.getByRole('group', { name: 'Switch active plant' }).getByRole('button', { name: label }).click();
}

try {
  const page = await open();
  await page.goto(url);
  await canvas(page, 'monstera').waitFor();
  await shot(page, 'stage-monstera');
  const dimensions = await canvas(page, 'monstera').boundingBox();
  await canvas(page, 'monstera').click({ position: { x: dimensions.width * 0.5, y: dimensions.height * 0.66 } });
  await page.locator('.companion-stage .stage-toast').waitFor();
  for (const entry of authoredSpecies.slice(1)) {
    await choose(page, `Test ${entry.commonName}`);
    await canvas(page, entry.assetId).waitFor();
    await shot(page, `stage-${entry.assetId}`);
  }
  await choose(page, 'Test Monstera');
  await canvas(page, 'monstera').waitFor();
  await page.evaluate(() => {
    const gl = document.querySelector('canvas[data-stage-model]').getContext('webgl2');
    window.testLostContext = gl.getExtension('WEBGL_lose_context');
    window.testLostContext.loseContext();
  });
  await page.locator('.companion-stage .stage-fallback img').waitFor();
  await page.evaluate(() => window.testLostContext.restoreContext());
  await canvas(page, 'monstera').waitFor();
  await page.locator('.companion-stage .stage-fallback').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.companion-stage canvas').count(), 1);
  await page.close();

  const still = await open({ reducedMotion: 'reduce', viewport: { width: 375, height: 812 } });
  await still.goto(url);
  await canvas(still, 'monstera').waitFor();
  await shot(still, 'mobile-monstera');
  const first = await canvas(still, 'monstera').screenshot();
  const next = await canvas(still, 'monstera').screenshot();
  assert.deepEqual(first, next, 'Reduced motion should preserve a stable pose');
  for (const entry of authoredSpecies.slice(1)) {
    await choose(still, `Test ${entry.commonName}`);
    await canvas(still, entry.assetId).waitFor();
    await shot(still, `mobile-${entry.assetId}`);
  }
  await still.close();

  const unavailable = await open({ reducedMotion: 'reduce', viewport: { width: 375, height: 812 } });
  await unavailable.route('**/characters/monstera-v3.glb', route => route.fulfill({ status: 404 }));
  const failedRequest = unavailable.waitForResponse(response => response.url().endsWith('/monstera-v3.glb'));
  await unavailable.goto(url);
  assert.equal((await failedRequest).status(), 404);
  await unavailable.locator('canvas[data-stage-renderer="ready"]').waitFor();
  assert.equal(await canvas(unavailable, 'monstera').count(), 0);
  assert(await unavailable.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await unavailable.close();

  const noWebGl = await open({ reducedMotion: 'reduce' });
  await noWebGl.addInitScript(() => Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined }));
  await noWebGl.goto(url);
  const preview = noWebGl.locator('.companion-stage img[src$="monstera-v3-preview.webp"]');
  await preview.waitFor();
  await noWebGl.waitForFunction(() => document.querySelector('.stage-fallback-card img')?.naturalWidth > 0);
  assert.equal(await noWebGl.locator('.companion-stage canvas').count(), 0);
  await noWebGl.close();

  const noPreview = await open({ reducedMotion: 'reduce' });
  await noPreview.addInitScript(() => localStorage.setItem('petey-disable-3d-v1', '1'));
  await noPreview.route('**/characters/monstera-v3-preview.webp', route => route.fulfill({ status: 404 }));
  await noPreview.goto(url);
  await noPreview.locator('.stage-fallback-card svg').waitFor();
  assert.equal(await noPreview.locator('.companion-stage canvas').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Authored model switching, single canvas, WebGL recovery, reduced motion, procedural fallback, and both static fallbacks passed.');
} finally {
  await browser.close();
}
