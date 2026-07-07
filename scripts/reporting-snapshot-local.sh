#!/usr/bin/env bash
# reporting-snapshot-local.sh — run the OLAP→reporting snapshot against LOCAL targets.
#
# Prerequisites (local dev only — no passwords, no VPS, no network):
#   1. The `gordi-esb-pg` docker container is running (warehouse, port 5432, trust auth).
#      → `docker start gordi-esb-pg` (or `docker compose up -d` in ~/Coding/gordi-esb-bak)
#   2. Local Supabase is running (port 44322, role `postgres`, trust auth).
#      → `supabase start` (from the mos-app dir, project gordi-mos)
#   3. The `reporting` schema migrations are applied locally:
#      → `supabase db reset` applies supabase/migrations/* including the reporting tables.
#
# Then: `scripts/reporting-snapshot-local.sh`
# Populates local reporting.sales_daily_revenue + reporting.sales_margin_daily with REAL rows
# from the local warehouse, so the /dashboard reads real data in local dev.
#
# Env-var construction is delegated to scripts/reporting_local_env.py (unit-tested — AC-030).
# Override REPORTING_ORG_ID if your local seed uses a different org id.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS="$ROOT/scripts"

echo "--- reporting-snapshot-local START: $(date) ---"
echo "warehouse: local gordi-esb-pg (127.0.0.1:5432/gordi_esb)"
echo "target:    local Supabase (127.0.0.1:44322, reporting schema)"

# Build the three required env vars via the testable helper (AC-030).
ENV_JSON="$("$PYTHON" -m reporting_local_env 2>/dev/null || python3 -m reporting_local_env 2>/dev/null || true)"
if [ -z "$ENV_JSON" ]; then
  # Fall back to plain defaults if the python helper isn't importable from here.
  ENV_JSON="$(cd "$SCRIPTS" && python3 -m reporting_local_env)"
fi

# Export the three keys reporting_snapshot.py requires.
WAREHOUSE_DB_URL="$(printf '%s' "$ENV_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["WAREHOUSE_DB_URL"])')"
SUPABASE_REPORTING_DB_URL="$(printf '%s' "$ENV_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["SUPABASE_REPORTING_DB_URL"])')"
REPORTING_ORG_ID="$(printf '%s' "$ENV_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["REPORTING_ORG_ID"])')"
export WAREHOUSE_DB_URL SUPABASE_REPORTING_DB_URL REPORTING_ORG_ID

echo "org:       $REPORTING_ORG_ID"
echo

cd "$SCRIPTS"
set +e
python3 -c '
import os, sys
sys.path.insert(0, ".")
from reporting_snapshot import SnapshotConfig, run_all_snapshots
config = SnapshotConfig.from_env(os.environ)
counts = run_all_snapshots(config)
print(
    "reporting_snapshot-local END "
    f"revenue={counts[\"revenue\"]} margin={counts[\"margin\"]} "
    f"window_days={config.window_days}"
)
'
rc=$?
set -e

echo "--- reporting-snapshot-local END: $(date) exit=${rc} ---"
exit "$rc"
