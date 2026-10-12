#!/usr/bin/env bash
# quality-checks — deterministic code-quality ratchets: jscpd duplication, knip dead code,
# stylelint raw colours outside tokens. Fails when a current number exceeds the committed
# baseline (mos-app/.quality-baseline.json); hints — never auto-lowers — when it drops.
# QUALITY_CHECKS_CURRENT_JSON (self-tests only) injects measured numbers instead of running tools.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$root/mos-app"

baseline_file=".quality-baseline.json"
[ -f "$baseline_file" ] || { echo "✗ mos-app/.quality-baseline.json missing" >&2; exit 1; }

if [ -n "${QUALITY_CHECKS_CURRENT_JSON:-}" ]; then
  current="$QUALITY_CHECKS_CURRENT_JSON"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "── jscpd: duplicate code over src"
  node_modules/.bin/jscpd src --config .jscpd.json --reporters json --output "$tmp/jscpd" >/dev/null 2>&1 || :
  echo "── knip: dead exports, unused files, unused deps"
  node_modules/.bin/knip --reporter json --no-progress >"$tmp/knip.json" 2>/dev/null || :
  echo "── stylelint: raw colours outside src/styles/tokens"
  # stylelint prints its formatter output to stderr whenever lint problems exist.
  node_modules/.bin/stylelint 'src/**/*.css' --config .stylelintrc.quality.json \
    --formatter json >"$tmp/stylelint.out" 2>"$tmp/stylelint.json" || :
  current="$(node -e '
    const fs = require("fs")
    const read = (p, fallback) => {
      const bytes = fs.readFileSync(p)
      return bytes.length ? JSON.parse(bytes.toString()) : fallback
    }
    const jscpd = read(process.argv[1] + "/jscpd/jscpd-report.json", null)
    const knip = read(process.argv[1] + "/knip.json", { issues: [] })
    const stylelint = read(process.argv[1] + "/stylelint.json", [])
    if (!jscpd) { console.error("jscpd produced no report"); process.exit(1) }
    let knipIssues = 0
    for (const file of knip.issues)
      for (const entries of Object.values(file)) if (Array.isArray(entries)) knipIssues += entries.length
    let colour = 0
    for (const result of stylelint) colour += result.warnings.length
    console.log(JSON.stringify({
      jscpdPercent: jscpd.statistics.total.percentage,
      knipIssues,
      stylelintColourViolations: colour,
    }))
  ' "$tmp")"
fi

rc=0
for key in jscpdPercent knipIssues stylelintColourViolations; do
  base="$(BASE_FILE="$baseline_file" KEY="$key" node -p 'JSON.parse(require("fs").readFileSync(process.env.BASE_FILE, "utf8"))[process.env.KEY]')"
  cur="$(CURRENT="$current" KEY="$key" node -p 'JSON.parse(process.env.CURRENT)[process.env.KEY]')"
  if awk -v c="$cur" -v b="$base" 'BEGIN { exit !(c > b) }'; then
    echo "✗ $key: $cur exceeds baseline $base — fix the regression; do not raise the baseline" >&2
    rc=1
  elif awk -v c="$cur" -v b="$base" 'BEGIN { exit !(c < b) }'; then
    echo "✓ $key: $cur below baseline $base — tighten by lowering mos-app/.quality-baseline.json"
  else
    echo "✓ $key: $cur (baseline $base)"
  fi
done
exit "$rc"
