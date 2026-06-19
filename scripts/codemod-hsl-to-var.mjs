#!/usr/bin/env node
/* eslint-disable no-console */
// Codemod: hsl(var(--t)) -> var(--t), and hsl(var(--t) / <alpha>) -> color-mix(...).
// Issue 1 / Phase B (docs/plans/2026-06-19-design-system-adoption.md Task B1).
//
// Scope: mos-app/src/**/*.{css,tsx,ts}
// EXCLUDES:
//   - index.css lines that DEFINE tokens (the :root / @theme inline block we
//     already rewrote) — we only transform CONSUMERS. We skip index.css entirely
//     because every line in it is now either a definition or an @import / @layer rule.
//   - test files: comments referencing old HSL values are left alone.
//   - the styles/tokens/* files we just created (kit values, not consumers).
//
// Transforms:
//   1. hsl(var(--token))                       -> var(--token)
//   2. hsl(var(--token) / <alpha>)             -> color-mix(in srgb, var(--token) <pct>%, transparent)
//      where <pct> = round(alpha * 100). Alpha may be a decimal (0.45) or whole (1).
//
// Run: node scripts/codemod-hsl-to-var.mjs          (writes in place)
//      node scripts/codemod-hsl-to-var.mjs --dry    (prints counts only)

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = 'mos-app/src';
const DRY = process.argv.includes('--dry');

// Gather target files (css/tsx/ts), excluding token-definition + test + tokens-dir.
const git = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
let files = git(`git ls-files '${ROOT}/**/*.css' '${ROOT}/**/*.tsx' '${ROOT}/**/*.ts'`)
  .filter(f =>
    !f.endsWith('mos-app/src/index.css') &&         // token-definition entry — already rewritten
    !f.includes('mos-app/src/styles/tokens/') &&    // app-owned kit token files
    !f.includes('docs/reference/') &&               // reference kit (read-only)
    !/\.test\.[tj]sx?$/.test(f)                     // tests: leave HSL refs in comments/assertions alone
  );

// Regexes (global). Order matters: alpha-branch FIRST (more specific), then plain.
//   hsl(  var(--t)  /  <alpha>  )
const RE_ALPHA = /hsl\(\s*var\((--[a-zA-Z0-9-]+)\)\s*\/\s*([0-9]*\.?[0-9]+)\s*\)/g;
//   hsl(  var(--t)  )
const RE_PLAIN = /hsl\(\s*var\((--[a-zA-Z0-9-]+)\)\s*\)/g;

let totalPlain = 0, totalAlpha = 0, touchedFiles = 0;
const perFile = [];

for (const f of files) {
  let src = readFileSync(f, 'utf8');
  let plain = 0, alpha = 0;
  src = src.replace(RE_ALPHA, (_m, tok, a) => {
    alpha++;
    const pct = Math.round(parseFloat(a) * 100);
    return `color-mix(in srgb, var(${tok}) ${pct}%, transparent)`;
  });
  src = src.replace(RE_PLAIN, (_m, tok) => {
    plain++;
    return `var(${tok})`;
  });
  if (plain || alpha) {
    touchedFiles++;
    totalPlain += plain; totalAlpha += alpha;
    perFile.push({ f, plain, alpha });
    if (!DRY) writeFileSync(f, src);
  }
}

console.log(`Files scanned: ${files.length}`);
console.log(`Files touched: ${touchedFiles}`);
console.log(`Plain  hsl(var(--t))      -> var(--t)            : ${totalPlain}`);
console.log(`Alpha  hsl(var(--t) / a)  -> color-mix(...)      : ${totalAlpha}`);
console.log(`TOTAL transforms                                   : ${totalPlain + totalAlpha}`);
if (DRY) console.log('\n(dry run — no files written)');
else console.log('\nPer-file:');
if (!DRY) for (const { f, plain, alpha } of perFile) console.log(`  ${f}: ${plain} plain, ${alpha} alpha`);
