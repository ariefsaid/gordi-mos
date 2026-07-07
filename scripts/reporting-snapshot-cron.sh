#!/usr/bin/env bash
set -u -o pipefail

ROOT="${HOME}/gordi-esb-bak"
PROJECT_REF="hvnwcsmkdeqmgqlbwflm"
POOLER_HOST="aws-1-ap-southeast-1.pooler.supabase.com"
REPORTING_ORG_ID="10000000-0000-0000-0000-000000000001"
# Sec-M1 (docs/reviews/dev.md "Before prod"): least-privilege snapshot writer. The op service
# account cannot write to the Gordi vault (verified 2026-07-04), so per the documented fallback
# this credential lives on the VPS at ~/.reporting-writer-cred (mode 0600, arief-owned — the cron
# already runs as arief, not root; see docs/reference/warehouse-online.md).
WRITER_CRED_FILE="${HOME}/.reporting-writer-cred"

cd "$ROOT"

echo "--- reporting-snapshot START: $(date) ---"

run_snapshot() {
  if [ ! -r "$WRITER_CRED_FILE" ]; then
    echo "reporting-snapshot-cron: missing $WRITER_CRED_FILE" >&2
    return 1
  fi

  PROJECT_REF="$PROJECT_REF" \
  POOLER_HOST="$POOLER_HOST" \
  REPORTING_ORG_ID="$REPORTING_ORG_ID" \
  WRITER_CRED_FILE="$WRITER_CRED_FILE" \
  ./sync/venv/bin/python - <<'PY'
import os
import sys
from urllib.parse import quote

sys.path.insert(0, "scripts")
from reporting_snapshot import SnapshotConfig, run_all_snapshots

with open(os.environ["WRITER_CRED_FILE"]) as f:
    writer_password = f.read().strip()

password = quote(writer_password, safe="")
pooler_dsn = (
    f"postgresql://reporting_writer.{os.environ['PROJECT_REF']}:{password}"
    f"@{os.environ['POOLER_HOST']}:5432/postgres?sslmode=require"
)

config = SnapshotConfig(
    warehouse_db_url="postgresql://gordi@127.0.0.1:5432/gordi_esb",
    supabase_reporting_db_url=pooler_dsn,
    org_id=os.environ["REPORTING_ORG_ID"],
)
counts = run_all_snapshots(config)
print(
    "reporting_snapshot END "
    f"revenue={counts['revenue']} margin={counts['margin']} "
    f"window_days={config.window_days} "
    f"contract={config.source_contract_version}"
)
PY
}

# Telegram success/failure alerting (AC-029). Mirrors the resource-watch.sh pattern:
# reads TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from env. Silent no-op if unset — the
# snapshot must not fail because alerting isn't configured.
notify_telegram() {
  local message="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    return 0  # alerting not configured; skip silently
  fi
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" \
    -d text="${message}" \
    --max-time 10 >/dev/null 2>&1 || true  # never fail the snapshot on alert failure
}

set +e
run_snapshot
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  notify_telegram "✅ reporting-snapshot succeeded (org ${REPORTING_ORG_ID:0:8}…) at $(date '+%H:%M WIB')"
else
  # Capture the last log lines for the failure message.
  LOG_TAIL="$(tail -n 5 "${HOME}/gordi-esb-bak/sync/logs/reporting-snapshot.log" 2>/dev/null | tr '\n' ' ' | head -c 300)"
  notify_telegram "❌ reporting-snapshot FAILED exit=${rc} at $(date '+%H:%M WIB'): ${LOG_TAIL}"
fi

echo "--- reporting-snapshot END: $(date) exit=${rc} ---"
exit "$rc"
