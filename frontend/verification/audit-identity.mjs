// Identity + scale audit for the Petey Plant R3F redesign.
// TDD gate: written BEFORE the redesign; must FAIL on the old
// Duolingo-styled tree and PASS on the new herbarium-ledger tree.
// Usage: node verification/audit-identity.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'node_modules' || e === 'dist') continue;
      walk(p, out);
    } else if (/\.(tsx|ts|css|js)$/.test(e) && !p.includes('verification')) out.push(p);
  }
  return out;
};
const srcFiles = walk(join(root, 'src'));
const tsxFiles = srcFiles.filter((f) => f.endsWith('.tsx'));
const read = (f) => readFileSync(f, 'utf8');

// ---- 1. Banned Duolingo tells must be gone from source ----
const banned = [
  ['duo-', 'Duolingo lip classes'],
  ['#58CC02', 'Duolingo chlorophyll'],
  ['#1CB0F6', 'Duolingo cyan'],
  ['#FF9600', 'Duolingo amber'],
  ['#FF4B4B', 'Duolingo coral'],
  ['#CE82FF', 'Duolingo violet'],
  ['#46A302', 'Duolingo lip green'],
  ['#1899D6', 'Duolingo lip blue'],
  ['#CC7800', 'Duolingo lip amber'],
  ['Fredoka', 'Fredoka rounded type'],
  ['Nunito', 'Nunito rounded body'],
  ['Flame', 'flame streak icon'],
  ['shadow-duo', 'lip shadow utilities'],
  ['rounded-full', 'pill shapes'],
  ['rounded-3xl', 'oversized radii'],
  ['border-4', 'chunky 4px borders'],
  ['border-b-[5px]', '5px bottom lip'],
  ['border-b-4', '4px bottom lip'],
  ['strokeDasharray="2 18"', 'dotted path'],
  ["'GO'", 'GO node label'],
];
for (const [needle, label] of banned) {
  const hits = srcFiles.filter((f) => read(f).includes(needle));
  check(`no banned token: ${label} (${needle})`, hits.length === 0,
    hits.map((h) => h.replace(root, '')).join(', '));
}
// XP word must not appear as display text in components/App (store field `xp` is fine).
const xpHits = [...tsxFiles, join(root, 'src/App.tsx')].filter((f) =>
  /\bXP\b/.test(read(f)));
check('no "XP" display text in components', xpHits.length === 0,
  xpHits.map((h) => h.replace(root, '')).join(', '));
// No white sclera eye material in the 3D canvas.
const canvas = read(join(root, 'src/components/three/PeteyTerrariumCanvas.tsx'));
check('no white sclera in canvas', !canvas.includes('#FFFFFF') && !canvas.includes('#ffffff'));
// Old quest-path component must be gone; growth ledger must exist.
const fs = await import('node:fs');
check('BotanicalQuestPath removed',
  !fs.existsSync(join(root, 'src/components/quest/BotanicalQuestPath.tsx')));
check('GrowthLedger exists',
  fs.existsSync(join(root, 'src/components/ledger/GrowthLedger.tsx')));

// ---- 2. New identity must be present ----
const main = read(join(root, 'src/main.tsx'));
check('Fraunces bundled', main.includes('@fontsource/fraunces'));
check('Archivo bundled', main.includes('@fontsource/archivo'));
check('JetBrains Mono kept', main.includes('@fontsource/jetbrains-mono'));
check('no Fredoka/Nunito imports', !main.includes('fredoka') && !main.includes('nunito'));
const tw = read(join(root, 'tailwind.config.js'));
const css = read(join(root, 'src/index.css'));
for (const [token, hex, where] of [
  // Theme-dependent tokens live as CSS vars (dark mode swaps them).
  ['paper', '#F8F5EA', css], ['ink', '#181B1F', css],
  ['leaf', '#00A159', tw], ['leafdeep', '#007338', tw],
  ['amber', '#DA950B', tw], ['danger', '#BE222A', tw],
  ['water', '#2591C4', tw],
]) {
  check(`palette token ${token} ${hex}`, where.toLowerCase().includes(hex.toLowerCase()));
}
check('ledger button class defined', read(join(root, 'src/index.css')).includes('.ledger-btn'));
check('ledger card class defined', read(join(root, 'src/index.css')).includes('.ledger-card'));

// ---- 3. Modular scale enforcement ----
// Allowed font-size classes: Tailwind text-base (16px) + the 1.25-ratio tokens.
const allowedText = new Set(['text-base', 'text-caption', 'text-body', 'text-subhead', 'text-title', 'text-display', 'text-hero']);
const bannedTextRe = /text-(xs|sm|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g;
const scaleSizes = new Set(['12.8', '16', '20', '25', '31.25', '39.06']);
const strokeOk = new Set(['1', '1.5', '2']);
let textViolations = [];
let pxViolations = [];
for (const f of srcFiles) {
  const src = read(f);
  const bad = [...src.matchAll(bannedTextRe)].map((m) => m[0]);
  if (bad.length) textViolations.push(`${f.replace(root, '')}: ${[...new Set(bad)].join(',')}`);
  // Arbitrary px values: must be divisible by 4, or a stroke width (1/1.5/2),
  // or an on-scale font size inside text-[...px].
  for (const m of src.matchAll(/\[(\d+(?:\.\d+)?)px\]/g)) {
    const v = m[1];
    const num = parseFloat(v);
    const isTextSize = src.slice(Math.max(0, m.index - 12), m.index).includes('text-');
    if (isTextSize) {
      if (!scaleSizes.has(v)) pxViolations.push(`${f.replace(root, '')}: text-[${v}px] off-scale`);
    } else if (!strokeOk.has(v) && num % 4 !== 0) {
      pxViolations.push(`${f.replace(root, '')}: [${v}px] not on 4pt grid`);
    }
  }
  // text-[...] with non-px units must not appear.
  const badUnits = [...src.matchAll(/text-\[\d+(?:\.\d+)?(?:rem|em|%)\]/g)];
  if (badUnits.length) pxViolations.push(`${f.replace(root, '')}: ${badUnits.map((m) => m[0]).join(',')}`);
}
check('no off-scale default text sizes', textViolations.length === 0, textViolations.join(' | '));
check('all arbitrary px on scale or stroke', pxViolations.length === 0, pxViolations.join(' | '));
// Radii: only scale tokens (sm 4 / md 8 / lg 12 / xl 16 / 2xl 24) via Tailwind names.
const radiusViolations = [];
for (const f of srcFiles) {
  const src = read(f);
  const bad = [...src.matchAll(/rounded-(full|3xl|none)\b/g)].filter((m) => m[1] !== 'none');
  if (bad.length) radiusViolations.push(`${f.replace(root, '')}: ${bad.map((m) => m[0]).join(',')}`);
}
check('no off-scale radii', radiusViolations.length === 0, radiusViolations.join(' | '));

console.log(`\n${failures.length === 0 ? 'AUDIT PASS' : `AUDIT FAIL (${failures.length} checks failed)`}`);
process.exit(failures.length === 0 ? 0 : 1);
