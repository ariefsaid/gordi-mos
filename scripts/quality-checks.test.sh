#!/usr/bin/env bash
# Self-test for scripts/quality-checks.sh — proves the ratchet: equal baseline passes, a lower
# baseline refuses, a higher baseline passes with the tighten hint. Injects current numbers via
# QUALITY_CHECKS_CURRENT_JSON, so no tool runs and the cases stay deterministic.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/quality-checks.sh"
pass=0; fail=0

check() { # $1 name · $2 expected rc · $3 injected current JSON · $4 expected fragment
  local name="$1" want="$2" current="$3" fragment="$4" out rc
  out="$(QUALITY_CHECKS_CURRENT_JSON="$current" bash "$SCRIPT" 2>&1)"; rc=$?
  if [ "$rc" -eq "$want" ] && printf '%s' "$out" | grep -q "$fragment"; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s)\n' "$name" "$rc" "$want"; printf '%s\n' "$out" | sed 's/^/        /'
  fi
}

# (a) fake baseline equals the current numbers → green, no hint.
check "equal baseline passes" 0 \
  "$(node -p 'JSON.stringify(JSON.parse(require("fs").readFileSync("mos-app/.quality-baseline.json", "utf8")))')" \
  "✓ stylelintColourViolations"

# (b) baseline lower than a current number → refuse.
knip=$(node -p 'JSON.parse(require("fs").readFileSync("mos-app/.quality-baseline.json", "utf8")).knipIssues')
check "current above baseline refuses" 1 \
  "{\"jscpdPercent\": 1.6, \"knipIssues\": $((knip + 1)), \"stylelintColourViolations\": 2}" \
  "exceeds baseline"

# (c) baseline higher than the current numbers → green plus the tighten hint.
check "current below baseline prints tighten hint" 0 \
  "{\"jscpdPercent\": 1.0, \"knipIssues\": $((knip - 1)), \"stylelintColourViolations\": 0}" \
  "tighten by lowering mos-app/.quality-baseline.json"

# Every ratcheted key is present and numeric in the committed baseline.
if node -e '
  const b = JSON.parse(require("fs").readFileSync("mos-app/.quality-baseline.json", "utf8"))
  for (const k of ["jscpdPercent", "knipIssues", "stylelintColourViolations"])
    if (typeof b[k] !== "number") process.exit(1)
'; then pass=$((pass+1)); printf '  ok    baseline has all three numeric keys\n'
else fail=$((fail+1)); printf '  FAIL  baseline keys missing or non-numeric\n'; fi

# Wiring: the heavy lane, CI verify and the package script must actually invoke the gate.
if grep -q 'quality-checks.sh' scripts/pre-pr-verify.sh; then
  pass=$((pass+1)); printf '  ok    pre-pr-verify invokes quality-checks\n'
else fail=$((fail+1)); printf '  FAIL  pre-pr-verify no longer calls quality-checks.sh\n'; fi
if grep -q 'quality-checks.sh' .github/workflows/verify.yml; then
  pass=$((pass+1)); printf '  ok    verify.yml invokes quality-checks\n'
else fail=$((fail+1)); printf '  FAIL  verify.yml no longer calls quality-checks.sh\n'; fi
if grep -q '"quality": "bash ../scripts/quality-checks.sh"' mos-app/package.json; then
  pass=$((pass+1)); printf '  ok    mos-app quality script wired\n'
else fail=$((fail+1)); printf '  FAIL  mos-app/package.json quality script missing\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
