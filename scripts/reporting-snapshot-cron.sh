#!/usr/bin/env bash
# Nightly warehouse -> Supabase reporting snapshot (cron). Every infrastructure coordinate comes
# from the untracked env file (see scripts/ops.env.example, OPS_ENV_FILE); a missing value
# refuses the run.
set -u -o pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ops-common.sh
. "$HERE/lib/ops-common.sh" || { echo "reporting-snapshot-cron: lib/ops-common.sh missing" >&2; exit 2; }

ops_load_env reporting-snapshot-cron || exit 2
ops_require reporting-snapshot-cron \
  SNAPSHOT_ROOT SUPABASE_PROJECT_REF SUPABASE_POOLER_HOST REPORTING_WRITER_ROLE \
  REPORTING_ORG_ID REPORTING_WRITER_CRED_FILE WAREHOUSE_DB_URL || exit 2

cd "$SNAPSHOT_ROOT" || { echo "reporting-snapshot-cron: cannot enter SNAPSHOT_ROOT" >&2; exit 2; }

echo "--- reporting-snapshot START: $(date) ---"

run_snapshot() {
  if [ ! -r "$REPORTING_WRITER_CRED_FILE" ]; then
    echo "reporting-snapshot-cron: writer credential file not readable (REPORTING_WRITER_CRED_FILE)" >&2
    return 1
  fi

  ./sync/venv/bin/python - <<'PY'
import os
import sys
from urllib.parse import quote

sys.path.insert(0, "scripts")
from reporting_snapshot import SnapshotConfig, run_all_snapshots

with open(os.environ["REPORTING_WRITER_CRED_FILE"]) as f:
    writer_password = f.read().strip()

password = quote(writer_password, safe="")
pooler_dsn = (
    f"postgresql://{os.environ['REPORTING_WRITER_ROLE']}.{os.environ['SUPABASE_PROJECT_REF']}:{password}"
    f"@{os.environ['SUPABASE_POOLER_HOST']}:5432/postgres?sslmode=require"
)

config = SnapshotConfig(
    warehouse_db_url=os.environ["WAREHOUSE_DB_URL"],
    supabase_reporting_db_url=pooler_dsn,
    org_id=os.environ["REPORTING_ORG_ID"],
)
counts = run_all_snapshots(config)
print(
    "reporting_snapshot END "
    f"revenue={counts['revenue']} margin={counts['margin']} usage={counts['usage']} "
    f"window_days={config.window_days} "
    f"contract={config.source_contract_version}"
)
PY
}

# Telegram success/failure alerting (AC-029): silent no-op when the notifier is unset, so the
# snapshot never fails because alerting is not configured (ops_notify in lib/ops-common.sh).
set +e
run_snapshot
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  ops_notify "✅ reporting-snapshot succeeded (org ${REPORTING_ORG_ID:0:8}…) at $(date '+%H:%M WIB')" || true
else
  # A psycopg traceback can echo the pooler DSN, which embeds the writer password: scrub it.
  LOG_TAIL="$(tail -n 5 "${SNAPSHOT_ROOT}/sync/logs/reporting-snapshot.log" 2>/dev/null \
    | ops_scrub | tr '\n' ' ' | head -c 300)"
  ops_notify "❌ reporting-snapshot FAILED exit=${rc} at $(date '+%H:%M WIB'): ${LOG_TAIL}" || true
fi

echo "--- reporting-snapshot END: $(date) exit=${rc} ---"
exit "$rc"
