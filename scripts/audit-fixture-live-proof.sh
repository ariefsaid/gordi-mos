#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${MOS_DB_LOCK_HELD:-}" != "1" ]; then
  exec "$ROOT/scripts/with-db-lock.sh" "$0" "$@"
fi

common_git_dir="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
canonical_root="$(dirname "$common_git_dir")"
if [ -f "$ROOT/mos-app/.env.e2e" ]; then
  export AUDIT_FIXTURE_ENV_FILE="$ROOT/mos-app/.env.e2e"
elif [ -f "$canonical_root/mos-app/.env.e2e" ]; then
  export AUDIT_FIXTURE_ENV_FILE="$canonical_root/mos-app/.env.e2e"
else
  echo "audit-fixture-live-proof: local E2E environment file is unavailable" >&2
  exit 2
fi

state_key="$(printf '%s' "$ROOT" | shasum -a 256 | cut -c1-16)"
state_dir="${TMPDIR:-/tmp}"
export AUDIT_FIXTURE_LEDGER_PATH="$state_dir/gordi-mos-audit-fixture-${state_key}.ledger.json"
export AUDIT_FIXTURE_BINDING_SECRET_FILE="$state_dir/gordi-mos-audit-fixture-${state_key}.secret"
export AUDIT_FIXTURE_RECEIPT_OUTPUT_DIR="$state_dir/gordi-mos-audit-fixture-${state_key}.receipt"
receipt_path="$AUDIT_FIXTURE_RECEIPT_OUTPUT_DIR/fixture-receipt.json"
mkdir -p "$AUDIT_FIXTURE_RECEIPT_OUTPUT_DIR"

recover_durable_receipt() {
  if [ ! -e "$receipt_path" ]; then
    return 0
  fi
  if [ ! -f "$AUDIT_FIXTURE_BINDING_SECRET_FILE" ]; then
    echo "audit-fixture-live-proof: durable receipt exists without its binding secret" >&2
    return 2
  fi
  if node --experimental-strip-types --input-type=module - \
    "$ROOT/mos-app/e2e/design-quality/audit-provisioner.ts" \
    "$ROOT/mos-app/e2e/design-quality/report.ts" \
    "$AUDIT_FIXTURE_ENV_FILE" "$receipt_path" "$AUDIT_FIXTURE_BINDING_SECRET_FILE" \
    "$AUDIT_FIXTURE_RECEIPT_OUTPUT_DIR" <<'NODE'
import { readFile, rm } from 'node:fs/promises'

const provisionerPath = process.argv[2]
const reportPath = process.argv[3]
const envPath = process.argv[4]
const receiptPath = process.argv[5]
const secretPath = process.argv[6]
const outputDir = process.argv[7]
const provisioner = await import(provisionerPath)
const { ReportWriter } = await import(reportPath)
const env = Object.fromEntries((await readFile(envPath, 'utf8')).split('\n').flatMap((line) => {
  const value = line.trim()
  const split = value.indexOf('=')
  return split > 0 && !value.startsWith('#')
    ? [[value.slice(0, split).trim(), value.slice(split + 1).trim()]]
    : []
}))
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('local E2E environment is missing the database service credentials')
const bindingSecret = (await readFile(secretPath, 'utf8')).trim()
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
const writer = new ReportWriter({ outputDir, candidateSha: receipt.candidateSha, sessionId: receipt.sessionId })
const cleaned = await provisioner.cleanupAuditFixtureReceipt(receipt, {
  candidateSha: receipt.candidateSha,
  sessionId: receipt.sessionId,
  bindingSecret,
  sql: provisioner.createLocalAuditSqlClient(url, serviceKey),
  auth: provisioner.createLocalAuditAuthClient(url, serviceKey),
  onFailure: true,
  onReceipt: async (nextReceipt) => { await writer.writeFixtureReceipt(nextReceipt) },
})
const validation = provisioner.validateAuditFixtureReceipt(cleaned, {
  candidateSha: receipt.candidateSha,
  sessionId: receipt.sessionId,
  bindingSecret,
})
if (!validation.ok) throw new Error(`durable receipt cleanup did not validate: ${validation.errors.join('; ')}`)
await rm(receiptPath, { force: true })
NODE
  then
    return 0
  else
    echo "audit-fixture-live-proof: durable receipt cleanup failed" >&2
    return 2
  fi
}

recover_durable_ledger() {
  if [ ! -e "$AUDIT_FIXTURE_LEDGER_PATH" ]; then
    return 0
  fi
  if [ ! -f "$AUDIT_FIXTURE_BINDING_SECRET_FILE" ]; then
    echo "audit-fixture-live-proof: durable ledger exists without its binding secret" >&2
    return 2
  fi
  if node --experimental-strip-types --input-type=module - \
    "$ROOT/mos-app/e2e/design-quality/audit-provisioner.ts" \
    "$AUDIT_FIXTURE_ENV_FILE" "$AUDIT_FIXTURE_LEDGER_PATH" "$AUDIT_FIXTURE_BINDING_SECRET_FILE" <<'NODE'
import { readFile } from 'node:fs/promises'

const modulePath = process.argv[2]
const envPath = process.argv[3]
const ledgerPath = process.argv[4]
const secretPath = process.argv[5]
const provisioner = await import(modulePath)
const env = Object.fromEntries((await readFile(envPath, 'utf8')).split('\n').flatMap((line) => {
  const value = line.trim()
  const split = value.indexOf('=')
  return split > 0 && !value.startsWith('#')
    ? [[value.slice(0, split).trim(), value.slice(split + 1).trim()]]
    : []
}))
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('local E2E environment is missing the database service credentials')
const bindingSecret = (await readFile(secretPath, 'utf8')).trim()
const ledger = await provisioner.readAuditFixtureSentinelLedger(ledgerPath, bindingSecret)
const sql = provisioner.createLocalAuditSqlClient(url, serviceKey)
await provisioner.cleanupAuditFixtureSentinelLedger(ledgerPath, {
  candidateSha: ledger.candidateSha,
  sessionId: ledger.sessionId,
  bindingSecret,
  sql,
})
NODE
  then
    rm -f "$AUDIT_FIXTURE_BINDING_SECRET_FILE"
  else
    echo "audit-fixture-live-proof: durable sentinel cleanup failed" >&2
    return 2
  fi
}

if [ -e "$receipt_path" ] || [ -e "$AUDIT_FIXTURE_LEDGER_PATH" ]; then
  recover_durable_receipt
  recover_durable_ledger
fi

umask 077
rm -f "$AUDIT_FIXTURE_BINDING_SECRET_FILE"
python3 - <<'PY' > "$AUDIT_FIXTURE_BINDING_SECRET_FILE"
import secrets
print(secrets.token_hex(32))
PY
chmod 600 "$AUDIT_FIXTURE_BINDING_SECRET_FILE"

export AUDIT_FIXTURE_CANDIDATE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
export AUDIT_FIXTURE_SESSION_ID="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(4))
PY
)"

on_interrupt() {
  cleanup_status=0
  recover_durable_receipt || cleanup_status=$?
  recover_durable_ledger || cleanup_status=$?
  if [ "$cleanup_status" -eq 0 ] && [ ! -e "$receipt_path" ] && [ ! -e "$AUDIT_FIXTURE_LEDGER_PATH" ]; then
    rm -f "$AUDIT_FIXTURE_BINDING_SECRET_FILE"
  fi
  if [ "$cleanup_status" -ne 0 ]; then
    exit "$cleanup_status"
  fi
  exit 143
}
trap on_interrupt INT TERM

cd "$ROOT/mos-app"
set +e
npx playwright test --config playwright.audit-fixture-live.config.ts
playwright_status=$?
set -e

cleanup_status=0
recover_durable_receipt || cleanup_status=$?
recover_durable_ledger || cleanup_status=$?
if [ "$cleanup_status" -eq 0 ] && [ ! -e "$receipt_path" ] && [ ! -e "$AUDIT_FIXTURE_LEDGER_PATH" ]; then
  rm -f "$AUDIT_FIXTURE_BINDING_SECRET_FILE"
fi
if [ "$playwright_status" -ne 0 ]; then
  exit "$playwright_status"
fi
exit "$cleanup_status"
