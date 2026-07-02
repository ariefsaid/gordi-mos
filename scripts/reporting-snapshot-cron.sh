#!/usr/bin/env bash
set -u -o pipefail

ROOT="${HOME}/gordi-esb-bak"
PROJECT_REF="hvnwcsmkdeqmgqlbwflm"
POOLER_HOST="aws-1-ap-southeast-1.pooler.supabase.com"
REPORTING_ORG_ID="10000000-0000-0000-0000-000000000001"

cd "$ROOT"

echo "--- reporting-snapshot START: $(date) ---"

run_snapshot() {
  set -a
  # OP_SERVICE_ACCOUNT_TOKEN only; do not print or inspect this file.
  # shellcheck disable=SC1090
  source "${HOME}/.op-token"
  set +a

  SUPABASE_DIRECT_URL="op://AS/gordi-mos-supabase-staging/URL" \
  PROJECT_REF="$PROJECT_REF" \
  POOLER_HOST="$POOLER_HOST" \
  REPORTING_ORG_ID="$REPORTING_ORG_ID" \
  op run -- ./sync/venv/bin/python - <<'PY'
import os
import sys
from urllib.parse import quote, urlparse

sys.path.insert(0, "scripts")
from reporting_snapshot import SnapshotConfig, run_snapshot

direct = urlparse(os.environ["SUPABASE_DIRECT_URL"])
password = quote(direct.password or "", safe="")
pooler_dsn = (
    f"postgresql://postgres.{os.environ['PROJECT_REF']}:{password}"
    f"@{os.environ['POOLER_HOST']}:5432/postgres?sslmode=require"
)

config = SnapshotConfig(
    warehouse_db_url="postgresql://gordi@127.0.0.1:5432/gordi_esb",
    supabase_reporting_db_url=pooler_dsn,
    org_id=os.environ["REPORTING_ORG_ID"],
)
rows = run_snapshot(config)
print(
    "reporting_snapshot END "
    f"rows={rows} window_days={config.window_days} "
    f"contract={config.source_contract_version}"
)
PY
}

set +e
run_snapshot
rc=$?
set -e

echo "--- reporting-snapshot END: $(date) exit=${rc} ---"
exit "$rc"
