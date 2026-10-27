/**
 * contrast.mjs — WCAG 2.1 contrast gate for Petey Plant text pairs.
 *
 * Computes contrast ratios from the actual token/fill values in
 * src/index.css and tailwind.config.js and fails (exit 1) when any
 * normal-text pair is below 4.5:1. Run: npm run verify:contrast
 *
 * Pairs cover: body text on paper/surface (light + dark themes),
 * signal button labels, and diagnostic status tags. Non-text fills
 * (progress bars, dots, vine lines) are exempt and not listed here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Extract the button fills the CSS actually uses (single source of truth).
function btnFill(cls) {
  const m = css.match(new RegExp(`\\.${cls} \\{[^}]*background-color:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`button fill not found for .${cls}`);
  return m[1].toLowerCase();
}

const PAIRS = [
  // [name, foreground, background]
  ['ink on paper (light)', '#181b1f', '#f8f5ea'],
  ['inksoft on paper (light)', '#4a4d53', '#f8f5ea'],
  ['ink on surface (light)', '#181b1f', '#fffef9'],
  ['ink on paper (dark)', '#f2efe3', '#1b211d'],
  ['inksoft on paper (dark)', '#b9bdb2', '#1b211d'],
  ['ink on leaftint', '#181b1f', '#c0eacd'],
  ['leafdeep on leaftint (tag)', '#007338', '#c0eacd'],
  ['ink on ambertint', '#181b1f', '#fde0b9'],
  ['ink on dangersoft', '#181b1f', '#ffdedb'],
  ['white on danger (tag/btn)', '#ffffff', '#be222a'],
  ['ink on amber (btn)', '#181b1f', '#da950b'],
  ['paper on ink (btn)', '#f8f5ea', '#181b1f'],
  ['white on leaf button', '#ffffff', btnFill('ledger-btn-leaf')],
  ['white on water button', '#ffffff', btnFill('ledger-btn-water')],
];

let failed = 0;
for (const [name, fg, bg] of PAIRS) {
  const r = ratio(fg, bg);
  const pass = r >= 4.5;
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${r.toFixed(2)}:1 (fg ${fg} on bg ${bg})`);
}
if (failed > 0) {
  console.log(`CONTRAST FAIL: ${failed} pair(s) below 4.5:1`);
  process.exit(1);
}
console.log('CONTRAST PASS');
