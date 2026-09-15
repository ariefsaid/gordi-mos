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
baseline_fixture=""
trap 'rm -f "$scope" /tmp/mos-audit-workspace-test.log /tmp/mos-design-quality-manifest-test.log /tmp/mos-design-quality-check.log /tmp/mos-design-quality-mutated.log; rm -rf "$baseline_fixture"' EXIT
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

baseline_fixture="$(mktemp -d -t mos-design-quality-baseline.XXXXXX)"
baseline_ref="origin/${MOS_PR_BASE:-dev}"
baseline_sha="$(git merge-base HEAD "$baseline_ref")"
baseline_id=b1c2d3e4
node --experimental-strip-types --input-type=module - "$baseline_fixture" "$baseline_sha" "$baseline_id" <<'NODE'
import { writeFile } from 'node:fs/promises'
import { DESIGN_QUALITY_MANIFEST, isManifestCellRunnable, manifestForArtifact } from './mos-app/e2e/design-quality/manifest.ts'
import { emptyAuditFixtureReceipt } from './mos-app/e2e/design-quality/audit-provisioner.ts'
import { computeArtifactDigest } from './mos-app/e2e/design-quality/change-gate.ts'
import { REQUIRED_ARTIFACTS, ReportWriter } from './mos-app/e2e/design-quality/report.ts'

const outputDir = process.argv[2]
const candidateSha = process.argv[3]
const sessionId = process.argv[4]
const writer = new ReportWriter({ outputDir, candidateSha, sessionId })
const runnable = DESIGN_QUALITY_MANIFEST.cells.filter(isManifestCellRunnable)
const shared = { observed: true, passed: true, selector: 'main h1' }
const visibleRows = runnable.flatMap((cell) => {
  const rows = [
    { ...shared, cellId: cell.id, kind: 'text-truncation', measured: JSON.stringify({
      scrollWidth: 100, clientWidth: 100, lineClamp: 'none', textOverflow: 'clip', fullValuePathExercised: false,
    }) },
    { ...shared, cellId: cell.id, kind: 'viewport-occlusion', measured: JSON.stringify({
      intersectionRatio: 0, centerCovered: false, fullyReachable: true, persistentBandCount: 0,
    }) },
  ]
  if (cell.viewport === 'phone-390x844') rows.push({ ...shared, cellId: cell.id, kind: 'touch-separation', measured: JSON.stringify({
    width: 44, height: 44, nearestDistance: null, populationSize: 1,
  }) })
  return rows
})
const firstCell = runnable[0].id
const controlRows = runnable.flatMap((cell) => [
  { cellId: cell.id, kind: 'population', selector: '__cell__', component: 'all-controls', variant: 'population', size: 'all', state: 'default', authority: 'fixture denominator', observed: true, passed: true,
    measured: JSON.stringify({ populationSize: 1, boundedChoicePopulation: 0, nativeSelectPopulation: 0 }) },
  { cellId: cell.id, kind: 'control', selector: 'main button', component: 'button', variant: 'outline', size: 'control-32', state: 'default', authority: 'fixture control contract', observed: true, passed: true,
    measured: JSON.stringify({ populationSize: 1, height: 32, radius: 8, borderWidth: 1, foreground: 'rgb(20,20,20)', background: 'rgb(255,255,255)', textContrast: 18, boundaryContrast: 3.1 }) },
])
for (const state of ['disabled', 'error']) controlRows.push({ cellId: firstCell, kind: 'control-state', selector: '__population__', component: 'all-controls', variant: 'state-face', size: 'all', state, authority: 'fixture state contract', observed: true, passed: true,
  measured: JSON.stringify({ state, populationSize: 1 }) })
await writer.writeJson('manifest.json', manifestForArtifact(candidateSha, sessionId))
await writer.writeFixtureReceipt(emptyAuditFixtureReceipt(candidateSha, sessionId))
await writer.writeGateLog(['browser_status=0', 'fixture_status=0', 'chain_status=not-run'])
await writer.writeCsv('contrast.csv', [{ cellId: firstCell, observed: true, passes: true, measured: JSON.stringify({ ratio: 18 }) }])
await writer.writeCsv('geometry.csv', [{ cellId: firstCell, observed: true, passes: true, measured: JSON.stringify({ overflow: 0 }) }])
await writer.writeCsv('number-census.csv', [{ cellId: firstCell, observed: true, passes: true, measured: JSON.stringify({ count: 1 }) }])
await writer.writeCsv('control-census.csv', [{ cellId: firstCell, observed: true, passes: true, measured: JSON.stringify({ count: 1 }) }])
await writer.writeCsv('control-consistency.csv', controlRows)
await writer.writeCsv('state-matrix.csv', runnable.map((cell) => ({ ...cell })))
await writer.writeCsv('affordance-census.csv', [{ cellId: firstCell, observed: true, passes: true, measured: JSON.stringify({ count: 1 }) }])
await writer.writeCsv('copy-census.csv', [{ cellId: firstCell, observed: true, passes: true, measured: JSON.stringify({ count: 1 }) }])
await writer.writeCsv('visible-content.csv', visibleRows)
const commonSummary = { auditMode: 'mvp-assessment', automaticChecksPassed: true, failures: [], allFailures: [], inheritedFailures: [], newFailures: [] }
await writer.writeJson('quantitative-summary.json', { ...commonSummary, geometryRows: 1, visibleContentRows: visibleRows.length })
await writer.writeJson('control-consistency-summary.json', { ...commonSummary, rows: controlRows.length })
await writer.writeJson('contrast-summary.json', { ...commonSummary, rows: 1 })
await writer.writeJson('anti-slop-summary.json', { ...commonSummary, cells: runnable.length })
await writer.writeJson('axe-summary.json', { ...commonSummary, scans: [{ cellId: firstCell, status: 'pass' }] })
await writer.writeJson('impeccable.json', { status: 'pass', scannedFiles: ['src/app.tsx'], findings: [], ...commonSummary })
await writer.writeJson('mockup-diff/status.json', { status: 'pass', comparisons: [{ cellId: firstCell, status: 'pass', score: 0.9, build: '/tmp/render.png', missingRegions: [], contradictedRegions: [] }] })
await writer.writeSession({
  auditMode: 'mvp-assessment',
  contextHandoffDir: outputDir,
  quantitativeArtifacts: REQUIRED_ARTIFACTS.map((name) => `${outputDir}/${name}`),
})
const session = JSON.parse(await (await import('node:fs/promises')).readFile(`${outputDir}/session.json`, 'utf8'))
const digest = await computeArtifactDigest(outputDir, session)
if (!digest.ok) throw new Error(digest.errors.join('; '))
await writer.writeSession({ ...session, artifactDigest: digest.digest })
NODE
if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate --baseline "$baseline_fixture" \
  >/tmp/mos-design-quality-check.log 2>&1; then
  ok "exact merge-base baseline preflight passes with a complete evidence set"
else
  bad "complete exact merge-base baseline preflight was refused"
  sed -n '1,120p' /tmp/mos-design-quality-check.log
fi

if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "change-gate without a baseline was accepted"
else
  ok "change-gate without a baseline fails closed"
fi

cp "$baseline_fixture/session.json" "$baseline_fixture/session.json.saved"
python3 - "$baseline_fixture/session.json" <<'PY'
import json
import pathlib
import sys
p = pathlib.Path(sys.argv[1])
data = json.loads(p.read_text())
data["candidateSha"] = "0" * 40
p.write_text(json.dumps(data) + "\n")
PY
if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate --baseline "$baseline_fixture" \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "stale baseline SHA mutation was accepted"
else
  ok "stale baseline SHA mutation fails closed"
fi
mv "$baseline_fixture/session.json.saved" "$baseline_fixture/session.json"
mv "$baseline_fixture/visible-content.csv" "$baseline_fixture/visible-content.csv.saved"
printf '# candidate_sha=%s\n# session_id=%s\nvalue\nrow\n' "$(printf 'b%.0s' {1..40})" "$baseline_id" > "$baseline_fixture/visible-content.csv"
if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate --baseline "$baseline_fixture" \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "tampered baseline artifact metadata was accepted"
else
  ok "tampered baseline artifact metadata fails closed"
fi
mv "$baseline_fixture/visible-content.csv.saved" "$baseline_fixture/visible-content.csv"
cp "$baseline_fixture/control-consistency-summary.json" "$baseline_fixture/control-consistency-summary.json.saved"
rm -f "$baseline_fixture/control-consistency-summary.json"
if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate --baseline "$baseline_fixture" \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "incomplete baseline summary was accepted"
else
  ok "incomplete baseline summary fails closed"
fi
mv "$baseline_fixture/control-consistency-summary.json.saved" "$baseline_fixture/control-consistency-summary.json"
cp "$baseline_fixture/geometry.csv" "$baseline_fixture/geometry.csv.saved"
printf '# candidate_sha=%s\n# session_id=%s\ncellId,observed,passes\n%s,true,true\n' "$baseline_sha" "$baseline_id" "${baseline_id}" >> "$baseline_fixture/geometry.csv"
if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate --baseline "$baseline_fixture" \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "tampered baseline bytes were accepted"
else
  ok "tampered baseline bytes fail the persisted digest binding"
fi
mv "$baseline_fixture/geometry.csv.saved" "$baseline_fixture/geometry.csv"
if DESIGN_AUDIT_CHECK_ONLY=1 DESIGN_AUDIT_ID=a1b2c3d4 \
  bash scripts/design-quality-audit.sh "$scope" --base-url http://localhost:5173/mos/ \
  --mode change-gate --baseline "$baseline_fixture/missing" \
  >/tmp/mos-design-quality-mutated.log 2>&1; then
  bad "missing baseline directory was accepted"
else
  ok "missing baseline directory fails closed"
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
