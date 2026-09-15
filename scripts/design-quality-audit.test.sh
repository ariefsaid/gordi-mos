#!/usr/bin/env bash
# Database-free self-test for the quantitative design-audit door.
#
# It exercises the manifest/report contracts and mutates a required coverage cell and the
# scope list to prove both faults turn the command red. The full browser/factory run is
# intentionally outside this self-test.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
pass=0
fail=0
ok() { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }

for required in \
  mos-app/e2e/design-quality/manifest.ts \
  mos-app/e2e/design-quality/measurements.ts \
  mos-app/e2e/design-quality/report.ts \
  mos-app/e2e/design-quality/audit-fixtures.ts \
  mos-app/e2e/design-quality/axe.spec.ts \
  mos-app/e2e/design-quality/quantitative-ui.spec.ts \
  mos-app/e2e/design-quality/contrast-states.spec.ts \
  mos-app/e2e/design-quality/anti-slop-census.spec.ts \
  mos-app/e2e/design-quality/mockup-fidelity.spec.ts \
  mos-app/playwright.design-audit.config.ts \
  scripts/design-quality-audit.sh; do
  if [ -e "$required" ]; then ok "required entry point exists: $required"; else bad "missing entry point: $required"; fi
done

if grep -q 'handle_audit_signal' scripts/design-quality-audit.sh \
  && grep -q 'fixtureExitStatus' scripts/design-quality-audit.sh \
  && grep -q 'fixture_status=' scripts/design-quality-audit.sh; then
  ok "interrupt cleanup preserves a terminal fixture status"
else
  bad "interrupt cleanup does not preserve a terminal fixture status"
fi

if node --experimental-strip-types --test \
  mos-app/e2e/design-quality/manifest.test.ts \
  mos-app/e2e/design-quality/mockup-authority.test.ts \
  >/tmp/mos-design-quality-manifest-test.log 2>&1; then
  ok "manifest/report/authority/mutation unit tests pass"
else
  bad "manifest/report/authority/mutation unit tests fail"
  sed -n '1,120p' /tmp/mos-design-quality-manifest-test.log
fi

scope="$(mktemp -t mos-design-quality-scope.XXXXXX)"
trap 'rm -f "$scope" /tmp/mos-design-quality-manifest-test.log /tmp/mos-design-quality-check.log /tmp/mos-design-quality-mutated.log' EXIT
cat > "$scope" <<'EOF'
- Tasks — /mos/work/tasks
- Signals — /mos/work/signals
- Inbox — /mos/inbox
- Café Opening — /mos/cafe
- Café Plan — /mos/cafe/plan
- Café Log — /mos/cafe/log
- Café Review — /mos/cafe/review
- Café Stock — /mos/cafe/stock
- Café Pushes — /mos/cafe/pushes
EOF

if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  >/tmp/mos-design-quality-check.log 2>&1; then
  ok "valid scope and localhost preflight pass without starting a server"
else
  bad "valid scope and localhost preflight refused"
  sed -n '1,120p' /tmp/mos-design-quality-check.log
fi

if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url https://staging.example/mos/ \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "foreign base URL mutation was accepted"
else
  ok "foreign base URL mutation fails closed"
fi

grep -v 'Café Pushes' "$scope" > "$scope.tmp"
mv "$scope.tmp" "$scope"
if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "missing required surface mutation was accepted"
else
  ok "missing required surface mutation fails closed"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
