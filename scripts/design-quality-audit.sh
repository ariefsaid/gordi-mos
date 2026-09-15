#!/usr/bin/env bash
# Safe preflight and live entry point for the quantitative design-quality run.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "design-quality-audit: run from inside the repository" >&2
  exit 2
}
cd "$ROOT"
. "$ROOT/scripts/lib/audit-fixture-recovery.sh"
. "$ROOT/scripts/lib/audit-workspace.sh"

usage() {
  cat >&2 <<'EOF'
usage: scripts/design-quality-audit.sh <scope.md> --base-url <localhost-url>
       [--config <sssf.config.yaml>] [--adw-id <8-hex-id>]
       [--mode mvp-assessment|change-gate] [--mockup-authority <docs/*.json>] [--check-only]
EOF
}

scope_file=""
base_url=""
config="adws/adw_sssf_config/sssf.config.yaml"
audit_id="${DESIGN_AUDIT_ID:-}"
check_only="${DESIGN_AUDIT_CHECK_ONLY:-0}"
audit_mode="${DESIGN_AUDIT_MODE:-mvp-assessment}"
mockup_authority="${DESIGN_AUDIT_MOCKUP_AUTHORITY:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      base_url="$2"
      shift 2
      ;;
    --config)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      config="$2"
      shift 2
      ;;
    --adw-id)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      audit_id="$2"
      shift 2
      ;;
    --mode)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      audit_mode="$2"
      shift 2
      ;;
    --mockup-authority)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      mockup_authority="$2"
      shift 2
      ;;
    --check-only)
      check_only=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "design-quality-audit: unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      if [ -n "$scope_file" ]; then
        echo "design-quality-audit: only one scope file is accepted" >&2
        usage
        exit 2
      fi
      scope_file="$1"
      shift
      ;;
  esac
done

case "$audit_mode" in
  mvp-assessment|change-gate) ;;
  *) echo "design-quality-audit: --mode must be mvp-assessment or change-gate" >&2; exit 2 ;;
esac

[ -n "$scope_file" ] || { echo "design-quality-audit: missing scope file" >&2; usage; exit 2; }
[ -n "$base_url" ] || {
  echo "design-quality-audit: --base-url is required and must point to localhost" >&2
  exit 2
}

scope_dir="$(dirname "$scope_file")"
scope_file="$(cd "$scope_dir" 2>/dev/null && pwd)/$(basename "$scope_file")" || {
  echo "design-quality-audit: cannot resolve scope file" >&2
  exit 2
}
[ -f "$scope_file" ] || { echo "design-quality-audit: scope file not found" >&2; exit 2; }
[ -s "$scope_file" ] || { echo "design-quality-audit: scope file is empty" >&2; exit 2; }

case "$config" in
  /*) config_file="$config" ;;
  *) config_file="$ROOT/$config" ;;
esac
[ -f "$config_file" ] || { echo "design-quality-audit: config not found" >&2; exit 2; }

base_url_info="$(python3 - "$base_url" <<'PY'
import sys
from urllib.parse import urlparse

value = sys.argv[1]
parsed = urlparse(value)
host = parsed.hostname or ""
if parsed.username is not None or parsed.password is not None:
    raise SystemExit(1)
if parsed.scheme not in {"http", "https"} or host.lower() not in {"localhost", "127.0.0.1", "::1"}:
    raise SystemExit(1)
if not parsed.path.startswith("/mos/") or parsed.query or parsed.fragment:
    raise SystemExit(1)
port = parsed.port or (443 if parsed.scheme == "https" else 80)
host_for_origin = f"[{host}]" if ":" in host else host
print(f"{host}\t{port}\t{parsed.scheme}://{host_for_origin}:{port}")
PY
)" || {
  echo "design-quality-audit: --base-url must be a bare localhost URL under /mos/ (no credentials, query, or fragment)" >&2
  exit 2
}
base_host="${base_url_info%%$'\t'*}"
base_url_info_rest="${base_url_info#*$'\t'}"
base_port="${base_url_info_rest%%$'\t'*}"
base_origin="${base_url_info_rest#*$'\t'}"

grep -q '^-[[:space:]]' "$scope_file" || {
  echo "design-quality-audit: scope file lists no surfaces (use one '- ' line per surface)" >&2
  exit 2
}
required_routes=(
  "/mos/work/tasks"
  "/mos/work/signals"
  "/mos/inbox"
  "/mos/cafe"
  "/mos/cafe/plan"
  "/mos/cafe/log"
  "/mos/cafe/review"
  "/mos/cafe/stock"
  "/mos/cafe/pushes"
)
for route in "${required_routes[@]}"; do
  grep -Fq -- "$route" "$scope_file" || {
    echo "design-quality-audit: scope is missing required route: $route" >&2
    exit 2
  }
done

candidate_sha="$(git rev-parse HEAD 2>/dev/null)" || {
  echo "design-quality-audit: unable to resolve candidate HEAD" >&2
  exit 2
}
printf '%s\n' "$candidate_sha" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "design-quality-audit: candidate HEAD is not a full lowercase SHA" >&2
  exit 2
}

if [ -z "$audit_id" ]; then
  audit_id="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(4))
PY
)"
fi
printf '%s\n' "$audit_id" | grep -Eq '^[0-9a-f]{8}$' || {
  echo "design-quality-audit: audit id must be exactly eight lowercase hex characters" >&2
  exit 2
}

data_dir="$(awk '$1 == "data_dir:" { print $2; exit }' "$config_file")"
[ -n "$data_dir" ] || { echo "design-quality-audit: config has no defaults.data_dir" >&2; exit 2; }
data_dir="${data_dir#\"}"
data_dir="${data_dir%\"}"
data_dir="${data_dir#\'}"
data_dir="${data_dir%\'}"
case "$data_dir" in
  /*) data_root="$data_dir" ;;
  *) data_root="$ROOT/$data_dir" ;;
esac
context_dir="$data_root/sessions/$audit_id/context_handoff"

if [ "$check_only" = "1" ]; then
  printf 'design-quality-audit preflight OK\ncandidate_sha=%s\nsession_id=%s\nscope=%s\nbase_url=%s\nmode=%s\n' \
    "$candidate_sha" "$audit_id" "$scope_file" "$base_url" "$audit_mode"
  exit 0
fi

audit_candidate_worktree_clean "$ROOT" || {
  echo "design-quality-audit: candidate worktree must be clean before a live evidence run" >&2
  exit 2
}

primary_workspace_root="$(audit_primary_workspace_root "$ROOT")" || {
  echo "design-quality-audit: cannot resolve the primary workspace" >&2
  exit 2
}
fixture_env_file="$(audit_fixture_env_file "$ROOT" "$primary_workspace_root")"
if [ -n "${AUDIT_FIXTURE_ENV_FILE:-}" ] && [ ! -f "$fixture_env_file" ]; then
  echo "design-quality-audit: configured fixture environment file was not found" >&2
  exit 2
fi
if [ -f "$fixture_env_file" ]; then
  export AUDIT_FIXTURE_ENV_FILE="$fixture_env_file"
  for env_name in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
    if [ -z "${!env_name:-}" ]; then
      env_value="$(audit_env_value "$fixture_env_file" "$env_name")" || exit 2
      if [ -n "$env_value" ]; then export "$env_name=$env_value"; fi
    fi
  done
fi
if [ -z "${VITE_SUPABASE_URL:-}" ] || [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  echo "design-quality-audit: app environment is incomplete for the owned dev server" >&2
  exit 2
fi

# A live run owns only a server it started. A listener that identifies as this
# worktree may be reused; a listener with no or another identity is refused.
identity_info="$(cd "$ROOT/mos-app" && node --experimental-strip-types --input-type=module - <<'NODE'
import { devServerPort, worktreeFingerprint } from './src/lib/dev-server.ts'
const appDir = process.cwd()
const port = devServerPort(appDir, process.env.MOS_DEV_PORT)
process.stdout.write(`${worktreeFingerprint(appDir)}\t${port}`)
NODE
 )" || {
  echo "design-quality-audit: cannot derive this worktree's dev-server identity" >&2
  exit 2
}
expected_identity="${identity_info%%$'\t'*}"
derived_port="${identity_info#*$'\t'}"
if [ -z "${MOS_DEV_PORT:-}" ] && [ "$base_port" != "$derived_port" ]; then
  echo "design-quality-audit: --base-url port $base_port does not match this worktree's derived port $derived_port" >&2
  exit 2
fi

server_pid=""
producer_hash_file=""
binding_secret_file=""
active_child_pid=""

stop_active_child() {
  local child_pid="${active_child_pid:-}"
  [ -n "$child_pid" ] || return 0
  if kill -0 "$child_pid" 2>/dev/null; then
    kill -TERM -- "-$child_pid" 2>/dev/null || kill -TERM "$child_pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$child_pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$child_pid" 2>/dev/null; then
      kill -KILL -- "-$child_pid" 2>/dev/null || kill -KILL "$child_pid" 2>/dev/null || true
    fi
  fi
  wait "$child_pid" 2>/dev/null || true
  active_child_pid=""
}

run_in_child_group() {
  local status
  set -m
  "$@" &
  active_child_pid=$!
  if wait "$active_child_pid"; then status=0; else status=$?; fi
  active_child_pid=""
  set +m
  return "$status"
}

cleanup() {
  status=$?
  trap - EXIT
  stop_active_child
  if [ "${fixture_cleanup_done:-0}" -ne 1 ] && [ -n "${context_dir:-}" ] \
    && declare -F run_fixture_cleanup >/dev/null 2>&1; then
    run_fixture_cleanup "${browser_status:-$status}" || true
  fi
  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  [ -z "$producer_hash_file" ] || rm -f "$producer_hash_file"
  if [ -n "$binding_secret_file" ] && [ "${fixture_cleanup_done:-0}" -eq 1 ] \
    && [ "${fixture_status:-125}" -eq 0 ]; then
    rm -f "$binding_secret_file"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

server_identity=""
if server_identity="$(curl --silent --show-error --fail --max-time 2 "$base_origin/_mos_dev_identity" 2>/dev/null)"; then
  if [ "$server_identity" != "$expected_identity" ]; then
    echo "design-quality-audit: refusing a listener owned by another worktree" >&2
    exit 2
  fi
else
  [ "$base_port" != "80" ] && [ "$base_port" != "443" ] || {
    echo "design-quality-audit: no owned server found and the URL has no usable development port" >&2
    exit 2
  }
  echo "design-quality-audit: starting an owned dev server on port $base_port" >&2
  (cd "$ROOT/mos-app" && npm run dev -- --host "$base_host" --port "$base_port" --strictPort) >"$ROOT/.design-quality-audit-server.log" 2>&1 &
  server_pid=$!
  server_ready=0
  for _ in $(seq 1 30); do
    if server_identity="$(curl --silent --show-error --fail --max-time 2 "$base_origin/_mos_dev_identity" 2>/dev/null)"; then
      server_ready=1
      break
    fi
    sleep 1
  done
  if [ "$server_ready" -ne 1 ] || [ "$server_identity" != "$expected_identity" ]; then
    echo "design-quality-audit: started server did not prove worktree ownership" >&2
    exit 2
  fi
fi

mkdir -p "$context_dir/screenshots" || {
  echo "design-quality-audit: unable to create the session artifact directory" >&2
  exit 2
}

recover_previous_fixture_receipt() {
  local previous_receipt="$context_dir/fixture-receipt.json"
  local previous_secret="$context_dir/fixture-binding.secret"
  local recovery_state
  recovery_state="$(audit_fixture_recovery_state "$previous_receipt" "$previous_secret")"
  case "$recovery_state" in
    none|completed) return 0 ;;
    incomplete)
      echo "design-quality-audit: prior fixture recovery artifacts are incomplete; refusing to overwrite them" >&2
      return 2
      ;;
    recover) ;;
    *)
      echo "design-quality-audit: prior fixture recovery state is invalid" >&2
      return 2
      ;;
  esac
  if (cd "$ROOT/mos-app" && "$ROOT/scripts/with-db-lock.sh" node --experimental-strip-types --input-type=module - "$context_dir" <<'NODE'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ReportWriter } from './e2e/design-quality/report.ts'
import {
  cleanupAuditFixtureReceipt,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  validateAuditFixtureReceipt,
} from './e2e/design-quality/audit-provisioner.ts'

const outputDir = process.argv[2]
const receipt = JSON.parse(await readFile(path.join(outputDir, 'fixture-receipt.json'), 'utf8'))
const bindingSecret = (await readFile(path.join(outputDir, 'fixture-binding.secret'), 'utf8')).trim()
let fileEnv = {}
try {
  const content = await readFile('./.env.e2e', 'utf8')
  fileEnv = Object.fromEntries(content.split('\n').flatMap((line) => {
    const value = line.trim()
    const split = value.indexOf('=')
    return split > 0 && !value.startsWith('#')
      ? [[value.slice(0, split).trim(), value.slice(split + 1).trim()]]
      : []
  }))
} catch { /* CI supplies credentials through process.env. */ }
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || 'http://127.0.0.1:44321'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || ''
if (!key) throw new Error('prior audit fixture recovery requires SUPABASE_SERVICE_ROLE_KEY')
const writer = new ReportWriter({ outputDir, candidateSha: receipt.candidateSha, sessionId: receipt.sessionId })
const cleaned = await cleanupAuditFixtureReceipt(receipt, {
  candidateSha: receipt.candidateSha,
  sessionId: receipt.sessionId,
  bindingSecret,
  sql: createLocalAuditSqlClient(url, key),
  auth: createLocalAuditAuthClient(url, key),
  onFailure: true,
  onReceipt: async (nextReceipt) => { await writer.writeFixtureReceipt(nextReceipt) },
})
const validation = validateAuditFixtureReceipt(cleaned, {
  candidateSha: receipt.candidateSha,
  sessionId: receipt.sessionId,
  bindingSecret,
})
if (!validation.ok) throw new Error(`prior audit fixture recovery did not validate: ${validation.errors.join('; ')}`)
NODE
  ); then
    rm -f "$previous_secret" "$previous_receipt"
  else
    echo "design-quality-audit: prior fixture cleanup failed; recovery artifacts were retained" >&2
    return 2
  fi
}

recover_previous_fixture_receipt || exit $?
binding_secret_file="$context_dir/fixture-binding.secret"
(umask 077 && python3 - <<'PY' > "$binding_secret_file"
import secrets
print(secrets.token_hex(32))
PY
) || {
  echo "design-quality-audit: unable to create the fixture binding secret" >&2
  exit 2
}
chmod 600 "$binding_secret_file" || exit 2

# Seed the handoff with the exact run contract. The browser specs replace the
# CSV/JSON placeholders; the chain gate refuses a session with missing or stale
# artifacts, so a partial browser run cannot be mistaken for evidence.
if node --experimental-strip-types --input-type=module - "$ROOT" "$context_dir" "$candidate_sha" "$audit_id" "$scope_file" "$base_url" "$audit_mode" "$binding_secret_file" <<'NODE'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { manifestForArtifact } from './mos-app/e2e/design-quality/manifest.ts'
import { REQUIRED_ARTIFACTS, ReportWriter } from './mos-app/e2e/design-quality/report.ts'
import { emptyAuditFixtureReceipt } from './mos-app/e2e/design-quality/audit-provisioner.ts'

const root = process.argv[2]
const outputDir = process.argv[3]
const candidateSha = process.argv[4]
const sessionId = process.argv[5]
const scopePath = process.argv[6]
const baseUrl = process.argv[7]
const auditMode = process.argv[8]
const bindingSecret = (await readFile(process.argv[9], 'utf8')).trim()
const writer = new ReportWriter({ outputDir, candidateSha, sessionId })
await mkdir(path.join(outputDir, 'screenshots'), { recursive: true })
await writer.writeJson('manifest.json', manifestForArtifact(candidateSha, sessionId))
await writer.writeGateLog([
  `candidate_sha=${candidateSha}`,
  `session_id=${sessionId}`,
  `scope=${scopePath}`,
  `base_url=${baseUrl}`,
  'browser_status=pending',
  'fixture_status=pending',
  'chain_status=pending',
])
for (const artifact of REQUIRED_ARTIFACTS) {
  if (artifact === 'manifest.json' || artifact === 'gate-log.txt' || artifact === 'fixture-receipt.json' || artifact === 'mockup-diff') continue
  if (artifact.endsWith('.json')) await writer.writeJson(artifact, { status: 'pending' })
  else await writer.writeCsv(artifact, [])
}
await writer.writeFixtureReceipt(emptyAuditFixtureReceipt(candidateSha, sessionId, bindingSecret))
await writer.writeJson('mockup-diff/status.json', { status: 'pending' })
await writer.writeSession({
  auditId: sessionId,
  sessionId,
  candidateSha,
  scopePath,
  baseUrl,
  auditMode,
  root,
  contextHandoffDir: outputDir,
  quantitativeArtifacts: REQUIRED_ARTIFACTS.map((name) => path.join(outputDir, name)),
  fixtureReceiptPath: path.join(outputDir, 'fixture-receipt.json'),
  fixtureWritesOccurred: false,
  browserExitStatus: null,
  fixtureExitStatus: null,
  chainExitStatus: null,
  fixturePolicy: 'read-only seeded fixtures; any audit-owned writes stay under this session',
})
NODE
then
  :
else
  seed_status=$?
  rm -f "$binding_secret_file" "$context_dir/fixture-receipt.json"
  binding_secret_file=""
  echo "design-quality-audit: unable to seed the audit evidence contract" >&2
  exit "$seed_status"
fi

export DESIGN_QUALITY_RUN=1
export DESIGN_AUDIT_BASE_URL="$base_url"
export DESIGN_AUDIT_OUTPUT_DIR="$context_dir"
export DESIGN_AUDIT_CANDIDATE_SHA="$candidate_sha"
export DESIGN_AUDIT_SESSION_ID="$audit_id"
export DESIGN_AUDIT_SCOPE="$scope_file"
export DESIGN_AUDIT_MODE="$audit_mode"
if [ -n "$mockup_authority" ]; then
  export DESIGN_AUDIT_MOCKUP_AUTHORITY="$mockup_authority"
fi

browser_status=0
fixture_status=125
fixture_cleanup_done=0

run_fixture_cleanup() {
  if [ "$fixture_cleanup_done" -eq 1 ]; then
    return "$fixture_status"
  fi
  local cleanup_browser_status="${1:-0}"
  fixture_status=0
  if (cd "$ROOT/mos-app" && "$ROOT/scripts/with-db-lock.sh" node --experimental-strip-types --input-type=module - "$context_dir" "$cleanup_browser_status" "$candidate_sha" "$audit_id" <<'NODE'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ReportWriter } from './e2e/design-quality/report.ts'
import {
  cleanupAuditFixtureReceipt,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  emptyAuditFixtureReceipt,
  validateAuditFixtureReceipt,
  validateAuditFixtureProvisionedReceipt,
} from './e2e/design-quality/audit-provisioner.ts'

const outputDir = process.argv[2]
const browserStatus = Number(process.argv[3])
const candidateSha = process.argv[4]
const sessionId = process.argv[5]
const session = JSON.parse(await readFile(path.join(outputDir, 'session.json'), 'utf8'))
if (session.candidateSha !== candidateSha || session.sessionId !== sessionId) {
  throw new Error('audit session metadata changed before fixture cleanup')
}
const writer = new ReportWriter({ outputDir, candidateSha, sessionId })
const receipt = JSON.parse(await readFile(path.join(outputDir, 'fixture-receipt.json'), 'utf8'))
const bindingSecret = (await readFile(path.join(outputDir, 'fixture-binding.secret'), 'utf8')).trim()
const expected = { candidateSha, sessionId, bindingSecret }
const provisionedValidation = validateAuditFixtureProvisionedReceipt(receipt, expected)
const cleanedValidation = validateAuditFixtureReceipt(receipt, expected)
if (!provisionedValidation.ok && !cleanedValidation.ok) {
  const errors = [...new Set([...provisionedValidation.errors, ...cleanedValidation.errors])]
  throw new Error(`invalid audit fixture receipt before cleanup: ${errors.join('; ')}`)
}
const owned = Array.isArray(receipt.created) && receipt.created.some((group) => Array.isArray(group.ids) && group.ids.length > 0)
  || Array.isArray(receipt.ownedAuthUsers) && receipt.ownedAuthUsers.length > 0
const hasSentinels = Array.isArray(receipt.sentinels) && receipt.sentinels.length > 0
if (!owned && !hasSentinels) {
  await writer.writeFixtureReceipt(emptyAuditFixtureReceipt(candidateSha, sessionId, bindingSecret))
} else {
  let fileEnv = {}
  try {
    const content = await readFile('./.env.e2e', 'utf8')
    fileEnv = Object.fromEntries(content.split('\n').flatMap((line) => {
      const trimmed = line.trim()
      const separator = trimmed.indexOf('=')
      return !trimmed || trimmed.startsWith('#') || separator < 1
        ? [] : [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()]]
    }))
  } catch { /* CI supplies credentials through process.env. */ }
  const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || 'http://127.0.0.1:44321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!key) throw new Error('audit fixture cleanup requires SUPABASE_SERVICE_ROLE_KEY')
  const cleaned = await cleanupAuditFixtureReceipt(receipt, {
    candidateSha,
    sessionId,
    sql: createLocalAuditSqlClient(url, key),
    auth: createLocalAuditAuthClient(url, key),
    bindingSecret,
    onFailure: browserStatus !== 0,
    onReceipt: async (nextReceipt) => { await writer.writeFixtureReceipt(nextReceipt) },
  })
  await writer.writeFixtureReceipt(cleaned)
}
NODE
  ); then
    fixture_status=0
  else
    fixture_status=$?
  fi
  fixture_cleanup_done=1
  return "$fixture_status"
}

write_terminal_evidence() {
  local terminal_browser_status="$1"
  local terminal_fixture_status="$2"
  local terminal_chain_status="$3"
  node --experimental-strip-types --input-type=module - "$context_dir" "$terminal_browser_status" "$terminal_fixture_status" "$terminal_chain_status" <<'NODE'
import { readFile } from 'node:fs/promises'
import { ReportWriter } from './mos-app/e2e/design-quality/report.ts'
const outputDir = process.argv[2]
const parseStatus = (value) => /^-?[0-9]+$/.test(value) ? Number(value) : value
const browserStatus = parseStatus(process.argv[3])
const fixtureStatus = parseStatus(process.argv[4])
const chainStatus = parseStatus(process.argv[5])
const session = JSON.parse(await readFile(`${outputDir}/session.json`, 'utf8'))
const writer = new ReportWriter({ outputDir, candidateSha: session.candidateSha, sessionId: session.sessionId })
await writer.writeSession({ ...session, browserExitStatus: browserStatus, fixtureExitStatus: fixtureStatus, chainExitStatus: chainStatus })
await writer.writeGateLog([
  `browser_status=${browserStatus}`,
  `fixture_status=${fixtureStatus}`,
  `chain_status=${chainStatus}`,
])
NODE
}

handle_audit_signal() {
  local signal_status="$1"
  trap - INT TERM
  browser_status="$signal_status"
  stop_active_child
  run_fixture_cleanup "$signal_status" || true
  write_terminal_evidence "$signal_status" "$fixture_status" skipped || true
  if [ "$fixture_status" -eq 0 ] && [ -n "$binding_secret_file" ]; then
    rm -f "$binding_secret_file"
    binding_secret_file=""
  fi
  exit "$signal_status"
}

trap 'handle_audit_signal 130' INT
trap 'handle_audit_signal 143' TERM

run_browser_lane() {
  cd "$ROOT/mos-app" && "$ROOT/scripts/with-db-lock.sh" npx playwright test --config playwright.design-audit.config.ts
}

if run_in_child_group run_browser_lane; then
  browser_status=0
else
  browser_status=$?
fi
run_fixture_cleanup "$browser_status" || true
if [ "$fixture_status" -eq 0 ]; then
  rm -f "$binding_secret_file"
  binding_secret_file=""
fi
write_terminal_evidence "$browser_status" "$fixture_status" "$([ "$browser_status" -eq 0 ] && [ "$fixture_status" -eq 0 ] && echo not-run || echo skipped)"
if [ "$browser_status" -ne 0 ]; then
  echo "design-quality-audit: browser lane failed; factory chain was not started" >&2
  exit "$browser_status"
fi
if [ "$fixture_status" -ne 0 ]; then
  echo "design-quality-audit: fixture cleanup failed; factory chain was not started" >&2
  exit "$fixture_status"
fi

# Freeze the browser producer's evidence before the independent reviewer sees it.
# The reviewer may add its audit and screenshots, but a change to any declared
# quantitative artifact invalidates the chain result.
producer_hash_file="$(mktemp -t mos-design-producer-hashes.XXXXXX)" || exit 2
python3 - "$context_dir/session.json" >"$producer_hash_file" <<'PY'
import hashlib, json, pathlib, sys

session = json.loads(pathlib.Path(sys.argv[1]).read_text())
for declared in sorted(session.get("quantitativeArtifacts", [])):
    target = pathlib.Path(declared).resolve()
    files = sorted(path for path in target.rglob("*") if path.is_file()) if target.is_dir() else [target]
    for path in files:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        print(f"{digest}  {path}")
PY

run_factory_lane() {
  bash "$ROOT/scripts/factory-run.sh" --allow-barred adw_design_audit.py "$scope_file" \
    --base-url "$base_url" --adw-id "$audit_id" --config "$config"
}

chain_status=0
if run_in_child_group run_factory_lane; then
  chain_status=0
else
  chain_status=$?
fi
current_hash_file="$(mktemp -t mos-design-current-hashes.XXXXXX)" || exit 2
python3 - "$context_dir/session.json" >"$current_hash_file" <<'PY'
import hashlib, json, pathlib, sys

session = json.loads(pathlib.Path(sys.argv[1]).read_text())
for declared in sorted(session.get("quantitativeArtifacts", [])):
    target = pathlib.Path(declared).resolve()
    files = sorted(path for path in target.rglob("*") if path.is_file()) if target.is_dir() else [target]
    for path in files:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        print(f"{digest}  {path}")
PY
if ! cmp -s "$producer_hash_file" "$current_hash_file"; then
  echo "design-quality-audit: reviewer modified browser-produced quantitative evidence" >&2
  chain_status=1
fi
rm -f "$current_hash_file"
node --experimental-strip-types --input-type=module - "$context_dir" "$chain_status" <<'NODE'
import { readFile } from 'node:fs/promises'
import { ReportWriter } from './mos-app/e2e/design-quality/report.ts'
const outputDir = process.argv[2]
const status = Number(process.argv[3])
const session = JSON.parse(await readFile(`${outputDir}/session.json`, 'utf8'))
const writer = new ReportWriter({ outputDir, candidateSha: session.candidateSha, sessionId: session.sessionId })
await writer.writeSession({ ...session, chainExitStatus: status })
await writer.writeGateLog([
  `browser_status=${session.browserExitStatus}`,
  `fixture_status=${session.fixtureExitStatus}`,
  `chain_status=${status}`,
])
NODE
exit "$chain_status"
