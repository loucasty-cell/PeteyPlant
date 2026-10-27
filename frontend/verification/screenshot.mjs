/**
 * screenshot.mjs — Playwright visual verification for the Petey Plant R3F shell.
 *
 * Repeatable check: boots `vite preview` of the production build, captures
 * screenshots at 320 / 768 / 1440 px widths of the full shell, the growth
 * ledger, the 3D terrarium canvas, the diagnostic drawer/panel, and
 * the irrigation node in its locked state, then analyses the terrarium
 * pixels (must not be blank or black) and checks for horizontal overflow.
 *
 * Run: npm run verify:screenshots
 * Output: verification/*.png + verification/report.json
 * Exit code 0 only when every shot + check passes.
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(ROOT, '..');
const OUT = ROOT;
const BASE = 'http://127.0.0.1:4173';
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Polling visibility check. locator.isVisible() snapshots instantly and
 * does not wait, so it misses elements mid open-animation (vaul drawer);
 * this polls until visible or the timeout elapses.
 */
async function waitVisible(locator, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await locator.isVisible()) return true;
    } catch {
      /* not attached yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Element screenshot via full-viewport capture + pngjs crop.
 * Why not locator/clip screenshots: (1) locator shots wait on a
 * scroll-stability gate that flakes on pages with a continuously
 * rendering WebGL canvas; (2) browser-side clip captures whose region
 * intersects the WebGL canvas deadlock in headless-shell + SwiftShader
 * (reproduced: viewport and non-canvas clips succeed, canvas-region
 * clips hang); (3) scrolling the canvas off-screen and back also
 * deadlocks later captures (reproduced). So element shots are taken
 * from a tall viewport where every element is visible at load with
 * NO scrolling, then cropped from the viewport buffer.
 */
async function shotElement(page, selector, file) {
  const vp = page.viewportSize();
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
  if (!box) throw new Error(`element ${selector} not found`);
  const buf = await page.screenshot();
  const src = PNG.sync.read(buf);
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(Math.round(box.width), vp.width - x, src.width - x);
  const h = Math.min(Math.round(box.height), vp.height - y, src.height - y);
  const dst = new PNG({ width: w, height: h });
  PNG.bitblt(src, dst, x, y, w, h, 0, 0);
  fs.writeFileSync(file, PNG.sync.write(dst));
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('preview server did not start'));
      setTimeout(tick, 500);
    };
    tick();
  });
}

/** Pixel analysis: a rendered canvas must be colourful, not blank/black. */
function analysePng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width, height, data } = png;
  const colors = new Set();
  let brightnessSum = 0;
  let black = 0;
  const total = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    colors.add((r << 16) | (g << 8) | b);
    brightnessSum += (r + g + b) / 3;
    if (r < 12 && g < 12 && b < 12) black += 1;
  }
  const meanBrightness = brightnessSum / total;
  const blackFraction = black / total;
  const pass =
    colors.size > 500 && meanBrightness > 20 && meanBrightness < 250 && blackFraction < 0.5;
  return { width, height, distinctColors: colors.size, meanBrightness: +meanBrightness.toFixed(1), blackFraction: +blackFraction.toFixed(3), pass };
}

// Spawn the vite binary directly (not via npx) in its own process group
// so cleanup reliably kills the server even if the script exits early.
const preview = spawn(
  path.join(APP_DIR, 'node_modules', '.bin', 'vite'),
  ['preview', '--port', '4173', '--strictPort', '--host', '127.0.0.1'],
  { cwd: APP_DIR, stdio: 'ignore', detached: true },
);

let exitCode = 0;
try {
  await waitForServer(`${BASE}/`);
  console.log('preview server up');

  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  for (const vp of VIEWPORTS) {
    // Shell shot on a normal-height page (fullPage capture works).
    {
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas', { timeout: 15000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, `shell-full-${vp.width}.png`), fullPage: true });
      record(`shot-shell-full-${vp.width}`, true);
      await page.close();
    }

    // Element shots on a tall-viewport page: everything visible at load,
    // zero scrolling, so the canvas never leaves the viewport.
    const page = await browser.newPage({ viewport: { width: vp.width, height: 2600 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(2500); // let R3F render several frames + fonts settle

    // Horizontal overflow check (320px discipline).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    record(`no-horizontal-overflow-${vp.width}`, !overflow, overflow ? 'page scrolls horizontally' : '');

    // Canvas presence + size.
    const canvasBox = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), canvases: document.querySelectorAll('canvas').length };
    });
    record(
      `single-canvas-rendered-${vp.width}`,
      canvasBox !== null && canvasBox.canvases === 1 && canvasBox.w > 100 && canvasBox.h > 100,
      canvasBox ? `${canvasBox.canvases} canvas(es), ${canvasBox.w}x${canvasBox.h}` : 'no canvas',
    );

    await shotElement(page, '#growth-ledger', path.join(OUT, `growth-ledger-${vp.width}.png`));
    record(`shot-growth-ledger-${vp.width}`, true);
    const terrFile = path.join(OUT, `terrarium-${vp.width}.png`);
    await shotElement(page, '#terrarium', terrFile);
    record(`shot-terrarium-${vp.width}`, true);
    // Telemetry badges must sit inside the canvas rect (no clipping).
    const badges = await page.evaluate(() => {
      const canvas = document.querySelector('#terrarium canvas');
      if (!canvas) return { ok: false, detail: 'no canvas' };
      const cr = canvas.getBoundingClientRect();
      const found = [...document.querySelectorAll('#terrarium div.whitespace-nowrap')].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          text: el.textContent,
          inside:
            r.left >= cr.left - 1 && r.right <= cr.right + 1 && r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1,
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        };
      });
      return { ok: found.length === 3 && found.every((b) => b.inside), detail: JSON.stringify(found) };
    });
    record(`badges-inside-canvas-${vp.width}`, badges.ok, badges.detail);
    const analysis = analysePng(terrFile);
    record(`terrarium-not-blank-${vp.width}`, analysis.pass, JSON.stringify(analysis));
    await page.close();
  }

  // Diagnostic drawer (mobile 320) via bottom nav.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.locator('nav[aria-label="Mobile"] button', { hasText: 'Diagnose' }).click();
    // Scope to the drawer container: vaul portals render at end of body,
    // AFTER the hidden desktop aside, so an unscoped .first() would pick
    // the display:none aside copy on mobile.
    const drawerVisible = await waitVisible(
      page.locator('.ledger-drawer >> text=APG IV + PlantNet provenance'),
      5000,
    );
    record('diagnostic-drawer-opens-320', drawerVisible);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'diagnostics-drawer-320.png') });
    record('shot-diagnostics-drawer-320', drawerVisible);
    // Depth evidence: scroll the drawer itself (page never scrolls, so
    // the canvas stays in view) to the ReAct trace and capture it.
    const traceVisible = await waitVisible(
      page.locator('.ledger-drawer >> text=ReAct trace'),
      5000,
    );
    record('diagnostic-react-trace-renders-320', traceVisible);
    await page.evaluate(() => {
      const drawer = document.querySelector('.ledger-drawer');
      if (drawer) drawer.scrollTop = drawer.scrollHeight;
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'diagnostics-depth-320.png') });
    record('shot-diagnostics-depth-320', traceVisible);
    await page.close();
  }

  // Diagnostic panel (desktop 1440).
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Open diagnostic inspector' }).click();
    const panelVisible = await page
      .locator('text=APG IV + PlantNet provenance')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    record('diagnostic-panel-opens-1440', panelVisible);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'diagnostics-panel-1440.png') });
    record('shot-diagnostics-panel-1440', panelVisible);
    await page.close();
  }

  // Irrigation node, locked state (default Monstera: trough above critical).
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    const lockButton = page.getByRole('button', { name: /Precision Leaching Irrigation/ });
    const label = await lockButton.getAttribute('aria-label');
    const isLocked = (label ?? '').includes('(locked)');
    record('irrigation-node-locked-default', isLocked, `aria-label=${label}`);
    await lockButton.click();
    const lockText = await page
      .locator('text=Locked — do not water yet')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    record('irrigation-lock-modal-shows', lockText);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'irrigation-locked-1440.png') });
    record('shot-irrigation-locked-1440', lockText);
    await page.close();
  }

  // ---- HARDENING CHECKS (superpowers pass) ----
  // Quest modal: Escape must close it, and focus must land inside it.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Microclimate Check-In' }).click();
    const dialogVisible = await waitVisible(page.locator('[role="dialog"]'), 5000);
    record('quest-modal-opens-1440', dialogVisible);
    if (dialogVisible) {
      const focusInfo = await page.evaluate(() => ({
        inside: !!document.activeElement?.closest('[role="dialog"]'),
        tag: document.activeElement?.tagName ?? 'none',
      }));
      record('quest-modal-focus-inside-1440', focusInfo.inside,
        `active=${focusInfo.tag}`);
      await page.keyboard.press('Escape');
      // Exit is a spring animation whose settle time varies under
      // SwiftShader load — poll for removal instead of a fixed wait.
      let dialogGone = false;
      for (let i = 0; i < 25 && !dialogGone; i++) {
        await page.waitForTimeout(200);
        dialogGone = (await page.locator('[role="dialog"]').count()) === 0;
      }
      record('quest-modal-esc-closes-1440', dialogGone);
    } else {
      record('quest-modal-focus-inside-1440', false, 'dialog never opened');
      record('quest-modal-esc-closes-1440', false, 'dialog never opened');
    }
    await page.close();
  }

  // Check-in flow: credits +25, grows the streak to 1 day, once per day.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Microclimate Check-In' }).click();
    await waitVisible(page.locator('[role="dialog"]'), 5000);
    await page.getByRole('button', { name: /Record reading/ }).click();
    await page.getByRole('button', { name: /Looks good/ }).click();
    await page.getByRole('button', { name: /Complete check-in/ }).click();
    const credited = await waitVisible(page.locator('text=/Check-in recorded/'), 5000);
    record('checkin-credits-growth-points', credited);
    // Modal auto-closes ~1.6 s after credit; then the row must read Pressed.
    await page.waitForTimeout(2200);
    const rowPressed = await page
      .getByRole('button', { name: /Microclimate Check-In \(completed\)/ })
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const streakOne = await page
      .locator('svg[aria-label="1-day check-in streak"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    record('checkin-row-pressed-and-streak-1', rowPressed && streakOne,
      `pressed=${rowPressed} streak1=${streakOne}`);
    // Reopen: same check-in must refuse a second credit today.
    await page.getByRole('button', { name: /Microclimate Check-In/ }).first().click();
    const alreadyDone = await waitVisible(
      page.locator('text=/Already completed today/'), 5000);
    record('checkin-once-per-day', alreadyDone);
    await page.getByRole('button', { name: 'Close quest' }).click().catch(() => {});
    await page.close();
  }

  // Species switch: canvas survives, no page errors, full name visible.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    for (const label of ['Goeppertia makoyana', 'Dracaena trifasciata', 'Ficus lyrata', 'Monstera deliciosa']) {
      await page.selectOption('#plant-switcher', { label });
      await page.waitForTimeout(1200);
    }
    const canvasOk = await page.evaluate(() => {
      const all = document.querySelectorAll('canvas');
      const c = document.querySelector('canvas');
      const r = c?.getBoundingClientRect();
      return all.length === 1 && !!r && r.width > 100 && r.height > 100;
    });
    record('species-switch-keeps-canvas', canvasOk && pageErrors.length === 0,
      `errors=${pageErrors.length}`);
    await page.close();
  }

  // Native select must show the full scientific name (Goeppertia case).
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.selectOption('#plant-switcher', { label: 'Goeppertia makoyana' });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const sel = document.querySelector('#plant-switcher');
      const text = sel.options[sel.selectedIndex].text;
      const cs = getComputedStyle(sel);
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const textWidth = cv.measureText(text).width;
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      return { text, textWidth: +textWidth.toFixed(1), clientWidth: sel.clientWidth, available: +(sel.clientWidth - pad - 24).toFixed(1) };
    });
    record('select-shows-full-scientific-name-320', m.textWidth <= m.available, JSON.stringify(m));
    await page.close();
  }

  // Diagnostic slider must drive a live recalculation.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Open diagnostic inspector' }).click();
    await waitVisible(page.locator('aside >> text=Environment controls'), 5000);
    const readVpd = () => page.evaluate(() => {
      const aside = document.querySelector('aside');
      if (!aside) return null;
      const dt = [...aside.querySelectorAll('dt')].find((d) => d.textContent.trim() === 'VPD leaf');
      return dt?.nextElementSibling?.textContent?.trim() ?? null;
    });
    const before = await readVpd();
    await page.evaluate(() => {
      const el = document.querySelector('#diag-rh');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '80');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    let after = before;
    try {
      await page.waitForFunction(
        (prev) => {
          const aside = document.querySelector('aside');
          if (!aside) return false;
          const dt = [...aside.querySelectorAll('dt')].find((d) => d.textContent.trim() === 'VPD leaf');
          return dt?.nextElementSibling?.textContent?.trim() !== prev;
        },
        before,
        { timeout: 5000 },
      );
      after = await readVpd();
    } catch {
      after = await readVpd();
    }
    record('diagnostic-slider-recalculates', before !== null && after !== null && before !== after,
      `VPD leaf ${before} -> ${after}`);
    await page.close();
  }

  // Dark mode toggle flips the .dark class both ways.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await page.waitForTimeout(300);
    const darkOn = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await page.waitForTimeout(300);
    const darkOff = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    record('dark-mode-toggles', darkOn && darkOff, `on=${darkOn} off=${darkOff}`);
    await page.close();
  }

  // Reduced-motion emulation must still render (no crash, canvas alive).
  {
    const page = await browser.newPage({
      viewport: { width: 320, height: 800 },
      reducedMotion: 'reduce',
    });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const canvasOk = await page.waitForSelector('canvas', { timeout: 15000 })
      .then(() => true).catch(() => false);
    record('reduced-motion-renders', canvasOk);
    await page.close();
  }

  await browser.close();
} catch (err) {
  console.error('VERIFICATION ERROR:', err);
  record('verification-ran', false, String(err));
} finally {
  try {
    process.kill(-preview.pid, 'SIGKILL');
  } catch {
    preview.kill('SIGKILL');
  }
}

const failed = results.filter((r) => !r.pass);
fs.writeFileSync(
  path.join(OUT, 'report.json'),
  JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2),
);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('FAILED:', failed.map((f) => f.name).join(', '));
  exitCode = 1;
}
process.exit(exitCode);
