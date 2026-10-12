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

# A baseline number only goes down. Compare with the baseline committed on dev; a raised number
# is refused even if the current measurement sits under it. QUALITY_CHECKS_DEV_BASELINE_JSON
# (self-tests only) injects dev's baseline; "none" means dev has no baseline yet.
if [ -n "${QUALITY_CHECKS_DEV_BASELINE_JSON:-}" ]; then
  dev_baseline="$QUALITY_CHECKS_DEV_BASELINE_JSON"; [ "$dev_baseline" = none ] && dev_baseline=""
else
  dev_ref=""
  for r in origin/dev dev; do git rev-parse -q --verify "$r^{commit}" >/dev/null 2>&1 && { dev_ref="$r"; break; }; done
  [ -n "$dev_ref" ] || { echo "✗ cannot see dev (origin/dev) to compare the baseline — fetch it first" >&2; exit 1; }
  dev_baseline="$(git show "$dev_ref:mos-app/$baseline_file" 2>/dev/null || true)"
fi
if [ -n "$dev_baseline" ]; then
  for key in jscpdPercent knipIssues stylelintColourViolations; do
    here="$(BASE_FILE="$baseline_file" KEY="$key" node -p 'JSON.parse(require("fs").readFileSync(process.env.BASE_FILE, "utf8"))[process.env.KEY]')"
    dev="$(DEV="$dev_baseline" KEY="$key" node -p 'JSON.parse(process.env.DEV)[process.env.KEY]')"
    if awk -v h="$here" -v d="$dev" 'BEGIN { exit !(h > d) }'; then
      echo "✗ $key baseline raised from $dev (dev) to $here — a baseline only goes down; fix the code instead" >&2; exit 1
    fi
  done
fi

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
