import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const srcDir = join(rootDir, 'frontend', 'src');
const budgetPath = join(rootDir, 'tools', 'slop-budget.json');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function measure() {
  const files = walk(srcDir);
  let ts_type_escapes = 0;
  let todo_markers = 0;
  let console_log = 0;
  let nondeterminism = 0;
  let css_raw_hex = 0;
  let css_px_literals = 0;
  let css_important = 0;
  let largest_ts_file_lines = 0;
  let largest_ts_file = '';
  let largest_css_file_lines = 0;
  let largest_css_file = '';

  for (const file of files) {
    const rel = relative(rootDir, file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n').length;

    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      ts_type_escapes += countMatches(content, /\bas\s+any\b|@ts-ignore|@ts-expect-error/g);
      todo_markers += countMatches(content, /\b(?:TODO|FIXME)\b/g);
      console_log += countMatches(content, /\bconsole\.log\(/g);
      nondeterminism += countMatches(content, /\bMath\.random\(/g);
      if (lines > largest_ts_file_lines) {
        largest_ts_file_lines = lines;
        largest_ts_file = rel;
      }
    } else if (file.endsWith('.css')) {
      todo_markers += countMatches(content, /\b(?:TODO|FIXME)\b/g);
      css_raw_hex += countMatches(content, /#[0-9a-fA-F]{3,8}\b/g);
      css_px_literals += countMatches(content, /\b\d+(?:\.\d+)?px\b/g);
      css_important += countMatches(content, /!important/g);
      if (lines > largest_css_file_lines) {
        largest_css_file_lines = lines;
        largest_css_file = rel;
      }
    }
  }

  return {
    metrics: {
      ts_type_escapes,
      todo_markers,
      console_log,
      nondeterminism,
      css_raw_hex,
      css_px_literals,
      css_important,
      largest_ts_file_lines,
      largest_css_file_lines,
    },
    details: { largest_ts_file, largest_css_file },
  };
}

const args = process.argv.slice(2);
const initMode = args.includes('--init');
const authFlag = args.indexOf('--authorities');
const { metrics, details } = measure();

if (initMode) {
  let care_decision_authorities = 2;
  if (authFlag !== -1 && args[authFlag + 1]) {
    care_decision_authorities = Number(args[authFlag + 1]);
  } else if (existsSync(budgetPath)) {
    const prev = JSON.parse(readFileSync(budgetPath, 'utf8'));
    if (typeof prev.care_decision_authorities === 'number') {
      care_decision_authorities = prev.care_decision_authorities;
    }
  }
  const budget = { ...metrics, care_decision_authorities };
  writeFileSync(budgetPath, JSON.stringify(budget, null, 2) + '\n', 'utf8');
  console.log('Initialized tools/slop-budget.json:', JSON.stringify(budget), details);
  process.exit(0);
}

if (!existsSync(budgetPath)) {
  console.error('Missing tools/slop-budget.json. Run: node tools/slop-audit.mjs --init');
  process.exit(1);
}

const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
const failures = [];
for (const [key, actual] of Object.entries(metrics)) {
  const limit = budget[key];
  if (typeof limit !== 'number' || actual > limit) {
    failures.push(`${key}: actual=${actual} > budget=${limit}`);
  }
}

console.log('Slop audit:', JSON.stringify({ ...metrics, care_decision_authorities: budget.care_decision_authorities }), details);
if (failures.length > 0) {
  console.error('Slop audit regression:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('SLOP AUDIT PASS');
