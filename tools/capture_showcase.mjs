import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(ROOT, 'frontend');
const IMAGES_DIR = path.resolve(ROOT, 'docs', 'images');

// Import playwright from frontend node_modules
const { chromium } = await import(pathToFileURL(path.join(FRONTEND_DIR, 'node_modules', 'playwright', 'index.mjs')).href);

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

const mockPlants = [
  {
    id: 'plant-monstera',
    name: 'Window Monstera',
    species_id: 'Monstera deliciosa',
    common_name: 'Monstera',
    drainage: 'yes',
    status: 'wait',
    message: 'Soil is currently moist. Hold off on watering.',
    check_prompt: 'Check whether the top 2-3 inches feel dry.',
    next_check_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    watering_guidance: 'Water thoroughly when the top 25–35% of potting mix has dried, allowing excess water to drain freely.',
    watering_source: 'Missouri Botanical Garden',
    history: [
      { id: 'hist-1', kind: 'watered', occurred_at: new Date(Date.now() - 4 * 86400000).toISOString() },
      { id: 'hist-2', kind: 'wet', occurred_at: new Date(Date.now() - 1 * 86400000).toISOString() },
    ],
  },
  {
    id: 'plant-pothos',
    name: 'Desk Trailing Pothos',
    species_id: 'Epipremnum aureum',
    common_name: 'Golden Pothos',
    drainage: 'yes',
    status: 'ready',
    message: 'Topsoil feels dry and crumbly. Ready for watering.',
    check_prompt: 'Check whether the top 2 inches feel dry.',
    next_check_at: new Date().toISOString(),
    watering_guidance: 'Water thoroughly until water drains from the bottom. Empty saucer after 15 minutes.',
    watering_source: 'NC State Extension',
    history: [
      { id: 'hist-3', kind: 'dry', occurred_at: new Date().toISOString() },
    ],
  },
  {
    id: 'plant-snake',
    name: 'Studio Snake Plant',
    species_id: 'Dracaena trifasciata',
    common_name: 'Snake Plant',
    drainage: 'yes',
    status: 'rest',
    message: 'Doing well in indirect light. Low water demand.',
    check_prompt: 'Allow mix to dry completely through before checking.',
    next_check_at: new Date(Date.now() + 10 * 86400000).toISOString(),
    watering_guidance: 'Drought-tolerant succulent. Water sparingly once every 2-3 weeks.',
    watering_source: 'ASPCA / RHS',
    history: [],
  },
  {
    id: 'plant-spider',
    name: 'Balcony Spider Plant',
    species_id: 'Chlorophytum comosum',
    common_name: 'Spider Plant',
    drainage: 'yes',
    status: 'check',
    message: 'Weekly moisture check is due today.',
    check_prompt: 'Feel the top inch of potting mix.',
    next_check_at: new Date(Date.now() - 3600000).toISOString(),
    watering_guidance: 'Keep evenly moist during growth periods. Avoid fluoride-heavy water.',
    watering_source: 'RHS',
    history: [],
  },
  {
    id: 'plant-aloe',
    name: 'Kitchen Sunburst Aloe',
    species_id: 'Aloe vera',
    common_name: 'Aloe Vera',
    drainage: 'yes',
    status: 'rest',
    message: 'Thriving in high light. Water demand is low.',
    check_prompt: 'Check when soil is dry all the way down.',
    next_check_at: new Date(Date.now() + 12 * 86400000).toISOString(),
    watering_guidance: 'Allow soil to dry completely between deep soakings.',
    watering_source: 'NC State Extension',
    history: [],
  },
  {
    id: 'plant-ficus',
    name: 'Corner Rubber Tree',
    species_id: 'Ficus elastica',
    common_name: 'Rubber Tree',
    drainage: 'yes',
    status: 'wait',
    message: 'Mix retains balanced hydration.',
    check_prompt: 'Check top 2 inches before next watering.',
    next_check_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    watering_guidance: 'Water when top 50% of potting mix is dry.',
    watering_source: 'Missouri Botanical Garden',
    history: [],
  },
  {
    id: 'plant-peacock',
    name: 'Velvet Calathea',
    species_id: 'Goeppertia makoyana',
    common_name: 'Peacock Plant',
    drainage: 'yes',
    status: 'check',
    message: 'High humidity required; check topsoil moisture.',
    check_prompt: 'Maintain consistent light moisture without waterlogging.',
    next_check_at: new Date().toISOString(),
    watering_guidance: 'Use distilled or rainwater; keep soil consistently moist.',
    watering_source: 'RHS',
    history: [],
  },
  {
    id: 'plant-areca',
    name: 'Living Room Areca Palm',
    species_id: 'Dypsis lutescens',
    common_name: 'Areca Palm',
    drainage: 'yes',
    status: 'wait',
    message: 'Hydration steady; fronds active.',
    check_prompt: 'Allow top surface to dry slightly between waterings.',
    next_check_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    watering_guidance: 'Prefers slightly moist soil with excellent drainage.',
    watering_source: 'UF/IFAS Extension',
    history: [],
  },
];

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function main() {
  console.log('🚀 Spawning Vite preview server...');
  const viteBin = path.join(FRONTEND_DIR, 'node_modules', '.bin', 'vite.cmd');
  const preview = spawn(viteBin, ['preview', '--port', '4173', '--host', '127.0.0.1'], {
    cwd: FRONTEND_DIR,
    stdio: 'ignore',
    shell: true,
  });

  const cleanup = () => {
    try {
      preview.kill();
    } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  await waitForServer('http://127.0.0.1:4173/');
  console.log('✅ Preview server running on http://127.0.0.1:4173');

  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });

  async function createConfiguredPage(viewport = { width: 1440, height: 900 }) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(() => {
      localStorage.setItem('petey-selected-plant-v1', 'plant-monstera');
      localStorage.removeItem('petey-disable-3d-v1');
    });

    await page.route('**/api/v1/garden/plants', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPlants),
      });
    });

    await page.route('**/api/v1/garden/species', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'Monstera deliciosa', name: 'Monstera', cultivar: '' },
          { id: 'Epipremnum aureum', name: 'Golden Pothos', cultivar: '' },
          { id: 'Dracaena trifasciata', name: 'Snake Plant', cultivar: '' },
          { id: 'Chlorophytum comosum', name: 'Spider Plant', cultivar: '' },
          { id: 'Aloe vera', name: 'Aloe Vera', cultivar: '' },
          { id: 'Ficus elastica', name: 'Rubber Tree', cultivar: '' },
          { id: 'Goeppertia makoyana', name: 'Peacock Plant', cultivar: '' },
          { id: 'Dypsis lutescens', name: 'Areca Palm', cultivar: '' },
        ]),
      });
    });

    return page;
  }

  // 1. Living Garden Desktop View
  console.log('📸 1. Capturing Living Garden Desktop View...');
  {
    const page = await createConfiguredPage({ width: 1440, height: 920 });
    await page.goto('http://127.0.0.1:4173/?view=home', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3500); // Wait for R3F 3D model and animations to settle
    const targetPath = path.join(IMAGES_DIR, 'petey-living-garden.png');
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`Saved: ${targetPath}`);
    await page.close();
  }

  // 2. Plant Care Detail Profile
  console.log('📸 2. Capturing Plant Detail Profile...');
  {
    const page = await createConfiguredPage({ width: 1440, height: 960 });
    await page.goto('http://127.0.0.1:4173/?plant=plant-monstera&action=profile', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const targetPath = path.join(IMAGES_DIR, 'petey-plant-detail-profile.png');
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`Saved: ${targetPath}`);
    await page.close();
  }

  // 3. Soil Checkup Observation Modal
  console.log('📸 3. Capturing Soil Checkup Modal...');
  {
    const page = await createConfiguredPage({ width: 1440, height: 920 });
    await page.addInitScript(() => {
      localStorage.setItem('petey-selected-plant-v1', 'plant-spider');
    });
    await page.route('**/api/v1/garden/plants/*/checkup', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plant_id: 'plant-spider',
          name: 'Balcony Spider Plant',
          species_id: 'Chlorophytum comosum',
          drainage: 'yes',
          check_prompt: 'Feel the top inch of potting mix before watering.',
          based_on: null,
        }),
      });
    });
    await page.goto('http://127.0.0.1:4173/?view=home', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const checkBtn = page.getByRole('button', { name: /Open soil checkup/i }).first();
    if (await checkBtn.isVisible()) {
      await checkBtn.click();
      await page.locator('dialog[open]').waitFor({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    const targetPath = path.join(IMAGES_DIR, 'petey-soil-checkup.png');
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`Saved: ${targetPath}`);
    await page.close();
  }

  // 4. Plant Health Triage Assistant
  console.log('📸 4. Capturing Plant Health Triage...');
  {
    const page = await createConfiguredPage({ width: 1440, height: 950 });
    await page.goto('http://127.0.0.1:4173/?view=care', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const targetPath = path.join(IMAGES_DIR, 'petey-plant-health-triage.png');
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`Saved: ${targetPath}`);
    await page.close();
  }

  // 5. Petey Lens Identifier
  console.log('📸 5. Capturing Petey Lens View...');
  {
    const page = await createConfiguredPage({ width: 1440, height: 920 });
    await page.goto('http://127.0.0.1:4173/?view=lens', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const targetPath = path.join(IMAGES_DIR, 'petey-lens-identifier.png');
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`Saved: ${targetPath}`);
    await page.close();
  }

  // 6. Plant Lab (Biophysical Digital Twin)
  console.log('📸 6. Capturing Plant Lab...');
  {
    const page = await createConfiguredPage({ width: 1440, height: 950 });
    await page.goto('http://127.0.0.1:4173/?view=lab', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const targetPath = path.join(IMAGES_DIR, 'petey-biophysical-lab.png');
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`Saved: ${targetPath}`);
    await page.close();
  }

  // 7. Mobile Living Garden View
  console.log('📸 7. Capturing Mobile Living Garden View...');
  {
    const page = await createConfiguredPage({ width: 375, height: 812 });
    await page.goto('http://127.0.0.1:4173/?view=home', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const targetPath = path.join(IMAGES_DIR, 'petey-living-garden-mobile.png');
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`Saved: ${targetPath}`);
    await page.close();
  }

  // 8. Capture Individual Companion Stages for Plant Pals Showcase
  console.log('📸 8. Capturing Plant Pals 3D Companions Showcase...');
  const speciesAssets = [
    { id: 'monstera', name: 'Monstera deliciosa', label: 'Monstera' },
    { id: 'pothos', name: 'Epipremnum aureum', label: 'Golden Pothos' },
    { id: 'snake-plant', name: 'Dracaena trifasciata', label: 'Snake Plant' },
    { id: 'spider-plant', name: 'Chlorophytum comosum', label: 'Spider Plant' },
    { id: 'aloe', name: 'Aloe vera', label: 'Aloe Vera' },
    { id: 'ficus', name: 'Ficus elastica', label: 'Rubber Tree' },
    { id: 'peacock-plant', name: 'Goeppertia makoyana', label: 'Peacock Plant' },
    { id: 'areca-palm', name: 'Dypsis lutescens', label: 'Areca Palm' },
  ];

  const companionShots = [];
  for (const sp of speciesAssets) {
    const page = await createConfiguredPage({ width: 600, height: 600 });
    await page.addInitScript((spId) => {
      localStorage.setItem('petey-selected-plant-v1', `plant-${spId}`);
    }, sp.id);

    const testPlants = [
      {
        id: `plant-${sp.id}`,
        name: sp.label,
        species_id: sp.name,
        common_name: sp.label,
        drainage: 'yes',
        status: 'rest',
        message: 'Thriving in warm greenhouse conditions.',
        check_prompt: 'Check below surface.',
        next_check_at: new Date(Date.now() + 5 * 86400000).toISOString(),
        watering_guidance: null,
        watering_source: null,
        history: [],
      },
    ];

    await page.route('**/api/v1/garden/plants', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testPlants),
      });
    });

    await page.goto('http://127.0.0.1:4173/?view=home', { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '.lv-stage-speech-wrap, .stage-toast { display: none !important; }' });
    const stageLocator = page.locator('.companion-stage');
    if (await stageLocator.isVisible()) {
      await page.waitForTimeout(1800);
      const shotBuffer = await stageLocator.screenshot();
      const b64 = shotBuffer.toString('base64');
      companionShots.push({ ...sp, b64 });
    }
    await page.close();
  }

  // Generate an HTML showcase of all 8 companions in a grid, and snapshot it!
  const showcaseHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0f1d16;
    color: #e5ede7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 32px;
  }
  .header {
    text-align: center;
    margin-bottom: 28px;
  }
  .header h1 {
    font-size: 28px;
    font-weight: 700;
    color: #9fe3bd;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
  }
  .header p {
    font-size: 15px;
    color: #8fa397;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    max-width: 1360px;
    margin: 0 auto;
  }
  .card {
    background: #162a20;
    border: 1px solid #234534;
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
  }
  .img-wrap {
    width: 100%;
    height: 240px;
    background: radial-gradient(circle at center, #1f3d2f 0%, #13241b 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .info {
    padding: 16px;
    text-align: center;
    width: 100%;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
    color: #e5ede7;
    margin-bottom: 4px;
  }
  .botanical {
    font-size: 12px;
    color: #799484;
    font-style: italic;
    margin-bottom: 8px;
  }
  .badge {
    display: inline-block;
    font-size: 11px;
    padding: 3px 8px;
    background: #204834;
    color: #8ae4b4;
    border-radius: 12px;
    font-weight: 500;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Petey Plant · 3D Botanical Companions</h1>
    <p>Eight living Plant Pals crafted with custom Blender geometry and React Three Fiber animations</p>
  </div>
  <div class="grid">
    ${companionShots.map(sp => `
      <div class="card">
        <div class="img-wrap">
          <img src="data:image/png;base64,${sp.b64}" alt="${sp.label}" />
        </div>
        <div class="info">
          <div class="name">${sp.label}</div>
          <div class="botanical">${sp.name}</div>
          <span class="badge">Living R3F Companion</span>
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>
  `;

  const showcasePage = await browser.newPage({ viewport: { width: 1400, height: 780 } });
  await showcasePage.setContent(showcaseHtml, { waitUntil: 'load' });
  await showcasePage.waitForTimeout(1000);
  const palsPath = path.join(IMAGES_DIR, 'petey-live-plant-pals.png');
  await showcasePage.screenshot({ path: palsPath, fullPage: true });
  console.log(`Saved composite: ${palsPath}`);
  await showcasePage.close();

  await browser.close();
  preview.kill();
  console.log('🎉 All showcase screenshots captured successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error capturing screenshots:', err);
  process.exit(1);
});
