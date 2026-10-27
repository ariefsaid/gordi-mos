#!/usr/bin/env bash
# Nightly warehouse -> Supabase snapshot and Café stream-usage refresh (cron). The existing 03:30
# WIB entry runs 25 minutes after the 03:05 ESB sync. Every infrastructure coordinate comes from
# the untracked env file (see scripts/ops.env.example, OPS_ENV_FILE); a missing value refuses the run.
# Café refresh requires CAFE_STREAM_ITEMS_ENABLED=1 after first-run approval in each environment.
set -u -o pipefail

SKIP_CAFE_STREAM_REFRESH=0
case "${1:-}" in
  "") ;;
  --snapshot-only) SKIP_CAFE_STREAM_REFRESH=1 ;;
  *) echo "reporting-snapshot-cron: usage: reporting-snapshot-cron.sh [--snapshot-only]" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ops-common.sh
. "$HERE/lib/ops-common.sh" || { echo "reporting-snapshot-cron: lib/ops-common.sh missing" >&2; exit 2; }

ops_load_env reporting-snapshot-cron || exit 2
ops_require reporting-snapshot-cron \
  SNAPSHOT_ROOT SUPABASE_PROJECT_REF SUPABASE_POOLER_HOST REPORTING_WRITER_ROLE \
  REPORTING_ORG_ID REPORTING_WRITER_CRED_FILE WAREHOUSE_DB_URL || exit 2

cd "$SNAPSHOT_ROOT" || { echo "reporting-snapshot-cron: cannot enter SNAPSHOT_ROOT" >&2; exit 2; }
REPORTING_PYTHON="${REPORTING_PYTHON:-$SNAPSHOT_ROOT/sync/venv/bin/python}"

echo "--- reporting-snapshot START: $(date) ---"

run_snapshot() {
  if [ ! -r "$REPORTING_WRITER_CRED_FILE" ]; then
    echo "reporting-snapshot-cron: writer credential file not readable (REPORTING_WRITER_CRED_FILE)" >&2
    return 1
  fi

  MOS_SCRIPTS_DIR="$HERE" "$REPORTING_PYTHON" - <<'PY'
import os
import sys
from urllib.parse import quote

mos_scripts_dir = os.path.realpath(os.environ["MOS_SCRIPTS_DIR"])
sys.path.insert(0, mos_scripts_dir)
import reporting_snapshot
from reporting_snapshot import SnapshotConfig, run_all_snapshots

if os.path.realpath(reporting_snapshot.__file__) != os.path.join(mos_scripts_dir, "reporting_snapshot.py"):
    raise ImportError("reporting_snapshot did not resolve from MOS scripts")

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

run_cafe_stream_usage_refresh() {
  local db_url catalog_file error_file catalog_sql rc
  local days="${CAFE_STREAM_ITEMS_DAYS:-180}"

  ops_require cafe-stream-usage-refresh \
    CAFE_STREAM_ITEMS_ESB_CODE CAFE_STREAM_ITEMS_BRANCH_MAP CAFE_STREAM_ITEMS_ORG_SLUG \
    OPS_DB_USER OPS_DB_HOST OPS_DB_PORT OPS_DB_NAME || return 2
  db_url="postgresql://${OPS_DB_USER}@${OPS_DB_HOST}:${OPS_DB_PORT}/${OPS_DB_NAME}?sslmode=require"

  catalog_file="$(umask 077; mktemp)" || { echo "cafe-stream-usage: cannot create temporary catalog file" >&2; return 1; }
  error_file="$(umask 077; mktemp)" || { rm -f "$catalog_file"; echo "cafe-stream-usage: cannot create temporary error file" >&2; return 1; }
  catalog_sql="select coalesce(json_agg(json_build_object(
    'esb_product_id', item.esb_product_id,
    'esb_product_detail_id', unit.esb_product_detail_id,
    'category', item.category,
    'has_active_bom_output', item.has_active_bom_output,
    'is_active', item.flag_active,
    'erp_category_type_name', btrim(item.erp_category_type_name)
  ) order by item.esb_product_id, unit.esb_product_detail_id), '[]'::json)::text
  from ops.wip_items item
  join ops.item_units unit on unit.org_id = item.org_id and unit.wip_item_id = item.id and unit.source_active
  join shared.orgs org on org.id = item.org_id
  where org.slug = :'cafe_org_slug'
    and item.reference_source = 'erp_catalog'
    and item.flag_active
    and lower(btrim(item.category)) in ('kitchen', 'bar')
    and lower(btrim(coalesce(item.erp_category_type_name, ''))) = 'inventory'
    and (item.has_active_bom_output or unit.erp_is_stock)"

  if ! PGOPTIONS='-c default_transaction_read_only=on' psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 \
      -v cafe_org_slug="$CAFE_STREAM_ITEMS_ORG_SLUG" >"$catalog_file" 2>"$error_file" <<< "$catalog_sql"; then
    ops_redact < "$error_file" >&2
    rm -f "$catalog_file" "$error_file"
    echo "cafe-stream-usage: active catalog read failed" >&2
    return 1
  fi
  if [ ! -s "$catalog_file" ] || [ "$(head -c 1 "$catalog_file")" != "[" ]; then
    rm -f "$catalog_file" "$error_file"
    echo "cafe-stream-usage: active catalog query returned no JSON array" >&2
    return 1
  fi
  rm -f "$error_file"

  echo "--- cafe-stream-usage START: $(date) ---"
  (
    unset PGOPTIONS
    CAFE_STREAM_ITEMS_DB_URL="$db_url" "$REPORTING_PYTHON" "$HERE/refresh-cafe-stream-items.py" \
      --erp-query-cmd "psql -X -qAt -v ON_ERROR_STOP=1" --erp-db-url-env WAREHOUSE_DB_URL \
      --catalog "$catalog_file" --esb-code "$CAFE_STREAM_ITEMS_ESB_CODE" --branch-map "$CAFE_STREAM_ITEMS_BRANCH_MAP" --days "$days" \
      --apply --allow-remote
  )
  rc=$?
  rm -f "$catalog_file"
  echo "--- cafe-stream-usage END: $(date) exit=${rc} ---"
  return "$rc"
}

# Telegram success/failure alerting: silent no-op when the notifier is unset, so the
# snapshot never fails because alerting is not configured (ops_notify in lib/ops-common.sh).
run_snapshot
snapshot_rc=$?
stream_rc=0
if [ "$SKIP_CAFE_STREAM_REFRESH" = 1 ]; then
  echo "cafe-stream-usage deferred for first-run review"
elif [ "${CAFE_STREAM_ITEMS_ENABLED:-}" != 1 ]; then
  SKIP_CAFE_STREAM_REFRESH=1
  echo "cafe-stream-usage disabled pending first-run approval (set CAFE_STREAM_ITEMS_ENABLED=1 after approval)"
else
  run_cafe_stream_usage_refresh
  stream_rc=$?
fi

if [ "$snapshot_rc" -ne 0 ]; then
  echo "Reporting details: ${SNAPSHOT_ROOT}/sync/logs/reporting-snapshot.log" >&2
  ops_notify "❌ MOS couldn't refresh its sales, margin and usage figures. Money may show older results until the next successful update; please check the reporting connection." || true
fi
if [ "$stream_rc" -ne 0 ]; then
  echo "Café stream usage details: ${SNAPSHOT_ROOT}/sync/logs/reporting-snapshot.log" >&2
  ops_notify "❌ MOS couldn't refresh Café stream usage after the ESB sync. Café Items lists may be stale; please check the reporting connection." || true
fi
if [ "$snapshot_rc" -eq 0 ] && [ "$stream_rc" -eq 0 ]; then
  if [ "$SKIP_CAFE_STREAM_REFRESH" = 1 ]; then
    ops_notify "✅ Sales, margin and usage figures are up to date in MOS. No action is needed." || true
  else
    ops_notify "✅ Sales, margin, usage and Café stream lists are up to date in MOS. No action is needed." || true
  fi
fi

rc=0
[ "$snapshot_rc" -eq 0 ] || rc="$snapshot_rc"
[ "$stream_rc" -eq 0 ] || rc="$stream_rc"

echo "--- reporting-snapshot END: $(date) exit=${rc} ---"
exit "$rc"
