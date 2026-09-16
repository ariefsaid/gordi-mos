#!/usr/bin/env bash
# Database-free self-test for the quantitative design-audit door.
#
# It exercises the manifest/report contracts and mutates a required coverage cell and the
# scope list to prove both faults turn the command red. The full browser/factory run is
# intentionally outside this self-test.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
. "$ROOT/scripts/lib/audit-fixture-recovery.sh"
pass=0
fail=0
ok() { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }

if bash scripts/lib/audit-workspace.test.sh >/tmp/mos-audit-workspace-test.log 2>&1; then
  ok "worktree audit context resolves and parses safely"
else
  bad "worktree audit context is invalid"
  sed -n '1,120p' /tmp/mos-audit-workspace-test.log
fi

for required in \
  mos-app/e2e/design-quality/manifest.ts \
  mos-app/e2e/design-quality/measurements.ts \
  mos-app/e2e/design-quality/change-gate.ts \
  mos-app/e2e/design-quality/change-gate.test.ts \
  mos-app/e2e/design-quality/bounded-choices.ts \
  mos-app/e2e/design-quality/audit-route.ts \
  mos-app/e2e/design-quality/report.ts \
  mos-app/e2e/design-quality/audit-fixtures.ts \
  mos-app/e2e/design-quality/axe.spec.ts \
  mos-app/e2e/design-quality/quantitative-ui.spec.ts \
  mos-app/e2e/design-quality/control-consistency.spec.ts \
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

if grep -Fq 'run_in_child_group run_browser_lane' scripts/design-quality-audit.sh \
  && grep -Fq 'run_in_child_group run_factory_lane' scripts/design-quality-audit.sh \
  && grep -Fq 'kill -TERM -- "-$child_pid"' scripts/design-quality-audit.sh \
  && grep -Fq 'wait "$child_pid"' scripts/design-quality-audit.sh \
  && grep -Fq 'stop_active_child' scripts/design-quality-audit.sh; then
  ok "interrupt cleanup stops and waits for each active child process group"
else
  bad "interrupt cleanup can race an active child process group"
fi

if grep -Fq 'fixture-binding.secret' scripts/design-quality-audit.sh \
  && grep -Fq 'chmod 600 "$binding_secret_file"' scripts/design-quality-audit.sh \
  && grep -Fq 'onReceipt: async (nextReceipt)' scripts/design-quality-audit.sh \
  && grep -Fq 'if [ "$fixture_status" -eq 0 ]' scripts/design-quality-audit.sh \
  && grep -Fq 'recover_previous_fixture_receipt' scripts/design-quality-audit.sh \
  && grep -Fq 'recovery artifacts were retained' scripts/design-quality-audit.sh; then
  ok "fixture receipt and binding secret remain recoverable until cleanup succeeds"
else
  bad "fixture receipt binding secret lifecycle is incomplete"
fi

if node --experimental-strip-types --input-type=module - <<'NODE'
import { REQUIRED_ARTIFACTS } from './mos-app/e2e/design-quality/report.ts'
if (!REQUIRED_ARTIFACTS.includes('visible-content.csv')) process.exit(1)
if (!REQUIRED_ARTIFACTS.includes('control-consistency.csv')) process.exit(1)
NODE
then
  ok "visible-content and control-consistency evidence are required by the audit runner"
else
  bad "visible-content or control-consistency evidence is missing from the audit runner contract"
fi

recovery_dir="$(mktemp -d -t mos-design-recovery.XXXXXX)"
recovery_receipt="$recovery_dir/fixture-receipt.json"
recovery_secret="$recovery_dir/fixture-binding.secret"
if [ "$(audit_fixture_recovery_state "$recovery_receipt" "$recovery_secret")" = none ]; then
  ok "fresh audit id has no recovery work"
else
  bad "fresh audit id recovery state is wrong"
fi
printf '{}\n' > "$recovery_receipt"
if [ "$(audit_fixture_recovery_state "$recovery_receipt" "$recovery_secret")" = completed ]; then
  ok "successful prior audit receipt can be replaced on rerun"
else
  bad "successful prior audit receipt bricks rerun"
fi
printf '0123456789abcdef\n' > "$recovery_secret"
if [ "$(audit_fixture_recovery_state "$recovery_receipt" "$recovery_secret")" = recover ]; then
  ok "retained receipt and secret require recovery"
else
  bad "retained recovery pair is not recognized"
fi
rm -f "$recovery_receipt"
if [ "$(audit_fixture_recovery_state "$recovery_receipt" "$recovery_secret")" = incomplete ]; then
  ok "orphaned binding secret fails closed"
else
  bad "orphaned binding secret was accepted"
fi
rm -rf "$recovery_dir"

if node --experimental-strip-types --test \
  mos-app/e2e/design-quality/manifest.test.ts \
  mos-app/e2e/design-quality/bounded-choices.test.ts \
  mos-app/e2e/design-quality/audit-route.test.ts \
  mos-app/e2e/design-quality/mockup-authority.test.ts \
  mos-app/e2e/design-quality/change-gate.test.ts \
  >/tmp/mos-design-quality-manifest-test.log 2>&1; then
  ok "manifest/report/authority/mutation unit tests pass"
else
  bad "manifest/report/authority/mutation unit tests fail"
  sed -n '1,120p' /tmp/mos-design-quality-manifest-test.log
fi

scope="$(mktemp -t mos-design-quality-scope.XXXXXX)"
missing_snapshot_base="design-audit-no-snapshot-$$"
missing_snapshot_ref="refs/remotes/origin/$missing_snapshot_base"
snapshot_intro="$(git log --format=%H --diff-filter=A -- mos-app/e2e/design-quality/automatic-failure-baseline.json | tail -1)"
snapshot_parent="$(git rev-parse "$snapshot_intro^")"
git update-ref "$missing_snapshot_ref" "$snapshot_parent"
trap 'git update-ref -d "$missing_snapshot_ref"; rm -f "$scope" /tmp/mos-audit-workspace-test.log /tmp/mos-design-quality-manifest-test.log /tmp/mos-design-quality-check.log /tmp/mos-design-quality-mutated.log' EXIT
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

if bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate --baseline /tmp/forged-baseline \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "filesystem baseline option was accepted"
else
  ok "filesystem baseline option is rejected"
fi

if DESIGN_AUDIT_BASELINE_DIR=/tmp/forged-baseline DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode mvp-assessment >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "baseline environment input was accepted"
else
  ok "baseline environment input is rejected"
fi

if MOS_PR_BASE="$missing_snapshot_base" DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "change-gate without a committed merge-base snapshot was accepted"
else
  ok "change-gate without a committed merge-base snapshot fails closed"
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
