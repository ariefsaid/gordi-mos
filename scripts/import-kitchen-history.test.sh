#!/usr/bin/env bash
# Self-test for scripts/import-kitchen-history.py — the kitchen history import (#349, OD-WAY-57).
# Hermetic: no database, no network. Guards the refusal paths (non-local DB URL), the export
# parsing (shapes, unknown action_type, superseded duplicates), and statically pins the generated
# SQL: it must load through the canonical catalog with ON CONFLICT DO NOTHING and must never
# write the integrations.esb_push outbox — the import can never create outbox work.
set -uo pipefail
cd "$(dirname "$0")/.."
# Hermeticity is enforced, not assumed: a leaked env var must not turn the no-db-url
# refusal check into a real load against whatever it points at (PR-gate finding, 2026-08-19).
unset KITCHEN_IMPORT_DB_URL
SCRIPT="$(pwd)/scripts/import-kitchen-history.py"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

check() { # $1 name · $2 expected exit code · then script args
  local name="$1" expect="$2"; shift 2
  local out rc
  out=$(python3 "$SCRIPT" "$@" 2>&1); rc=$?
  if [ "$rc" -eq "$expect" ]; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — expected rc=%d got rc=%d\n%s\n' "$name" "$expect" "$rc" "$out"
  fi
}

assert_contains() { # $1 name · $2 haystack-file · $3 needle
  if grep -Fq -- "$3" "$2"; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL  %s — %s missing from %s\n' "$1" "$3" "$2"; fi
}
assert_absent() { # $1 name · $2 haystack-file · $3 regex that must NOT match
  if grep -Eiq -- "$3" "$2"; then fail=$((fail+1)); printf '  FAIL  %s — %s matched %s\n' "$1" "$2" "$3"
  else pass=$((pass+1)); printf '  ok    %s\n' "$1"; fi
}

LOCAL_URL='postgresql://postgres:postgres@127.0.0.1:44322/postgres'
REMOTE_URL='postgresql://postgres:secretpw@db.example.invalid:5432/postgres'

# ── fixtures ──────────────────────────────────────────────────────────────────────────────────
# clean-ish fixture: logs use {"records":[...]}; plans use a bare array — both accepted shapes.
# recL2 (unknown label) and recP1→recP2 (superseded) are parse-level skips.
cat > "$tmp/wip.json" <<'EOF'
[{"id":"recW1","fields":{"name":"Nasi Goreng","esb_bom_id":"BOM-001","esb_product_detail_id_porsi":"PD-001","flag_active":true}},
 {"id":"recW2","fields":{"name":"Mystery Item","esb_bom_id":"BOM-NOPE","flag_active":true}}]
EOF
cat > "$tmp/logs.json" <<'EOF'
{"records":[
 {"id":"recL1","createdTime":"2026-08-01T02:00:00.000Z","fields":{"date":"2026-08-01T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Production","qty_porsi":10,"status":"Approved","submitted_by":"cahya.dev","reviewed_by":"dewi.dev","reviewed_at":"2026-08-01T09:30:00.000Z","posted_to_esb":true,"esb_doc_num":"ESB-HIST-1","posted_at":"2026-08-01T09:00:00.000Z","notes":"hift"}},
 {"id":"recL2","fields":{"date":"2026-08-02T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Fire Sale","qty_porsi":3,"status":"Approved"}},
 {"id":"recL3","fields":{"date":"2026-08-03T17:00:00.000Z","wip_item":{"id":"recW2"},"action_type":"Transfer to Radiant","qty_porsi":5,"status":"Approved","posted_to_esb":false}},
 {"id":"recL4","fields":{"date":"2026-08-04T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Transfer to GGS","qty_porsi":2,"status":"Submitted"}}]}
EOF
cat > "$tmp/plans.json" <<'EOF'
[{"id":"recP1","createdTime":"2026-08-01T01:00:00.000Z","fields":{"date":"2026-08-01T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Production","planned_qty":40,"plan_by":"dewi.dev","notes":"shift plan"}},
 {"id":"recP2","createdTime":"2026-08-01T05:00:00.000Z","fields":{"date":"2026-08-01T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Production","planned_qty":45,"plan_by":"dewi.dev"}}]
EOF

# ── refusal paths (AC-6) ─────────────────────────────────────────────────────────────────────
check "non-local db url refused"            2 --db-url "$REMOTE_URL" --wip "$tmp/wip.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run
check "localhost db url passes guard"       0 --db-url "$LOCAL_URL" --wip "$tmp/wip.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run --allow-unresolved
check "remote url passes with --allow-remote" 0 --db-url "$REMOTE_URL" --allow-remote --wip "$tmp/wip.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run --allow-unresolved
check "missing export file refused"         2 --db-url "$LOCAL_URL" --wip "$tmp/nope.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run
echo '{oops' > "$tmp/bad.json"
check "malformed json refused"              2 --db-url "$LOCAL_URL" --wip "$tmp/bad.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run
check "db url required for a real run"      2 --wip "$tmp/wip.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json"

# ── parse report + exit codes (AC-1 parse half) ──────────────────────────────────────────────
out=$(python3 "$SCRIPT" --db-url "$LOCAL_URL" --wip "$tmp/wip.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run 2>&1); rc=$?
if [ $rc -eq 3 ] && printf '%s' "$out" | grep -Fq "unknown action_type 'Fire Sale'" \
   && printf '%s' "$out" | grep -Fq 'superseded_duplicate'; then
  pass=$((pass+1)); printf '  ok    unresolvable rows reported, exit 3\n'
else
  fail=$((fail+1)); printf '  FAIL  unresolvable rows reported, exit 3 — rc=%d\n%s\n' "$rc" "$out"
fi

# ── generated SQL pinned statically (AC-2/3/4/5 static half) ─────────────────────────────────
python3 "$SCRIPT" --db-url "$LOCAL_URL" --wip "$tmp/wip.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run --allow-unresolved > "$tmp/load.sql" 2>/dev/null
assert_contains "SQL carries teable_import"      "$tmp/load.sql" "'teable_import'"
assert_contains "SQL lands Approved"             "$tmp/load.sql" "'Approved'"
assert_contains "SQL is idempotent"              "$tmp/load.sql" "on conflict do nothing"
assert_contains "SQL resolves catalog in-db"     "$tmp/load.sql" "jsonb_to_recordset"
assert_contains "SQL resolves org by slug"       "$tmp/load.sql" "shared.orgs"
assert_contains "SQL resolves wip by ERP id"     "$tmp/load.sql" "esb_bom_id"
assert_absent  "SQL never writes the outbox"     "$tmp/load.sql" 'insert[[:space:]]+into[[:space:]]+integrations\.esb_push'

# Locations sends use identifiers and only Approved source rows.
python3 - "$SCRIPT" "$tmp" <<'PY'
import importlib.util
import json
import pathlib
import sys
module_spec = importlib.util.spec_from_file_location('history', sys.argv[1])
history = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(history)
root = pathlib.Path(sys.argv[2])
logs = []
for identifier, action, status in [('send-rrs', 'Transfer to RRS', 'Approved'),
                                    ('send-bungur', 'Transfer to Bungur', 'Approved'),
                                    ('send-pending', 'Transfer to RRS', 'Submitted')]:
    logs.append({'id': identifier, 'fields': {'date': '2026-08-01T17:00:00Z',
        'wip_item': {'id': 'recW1'}, 'action_type': action, 'qty_porsi': 4, 'status': status}})
(root / 'sends.json').write_text(json.dumps(logs))
plans = [{'id': 'send-plan', 'fields': {'date': '2026-08-01T17:00:00Z',
    'wip_item': 'recW1', 'action_type': 'Transfer to Bungur', 'planned_qty': 4}}]
(root / 'send-plans.json').write_text(json.dumps(plans))
# pgTAP executes this generated SQL, not a hand-written approximation of the load.
wip = {'recW1': {'esb_bom_id': 'BOM-001'}, 'recW2': {'esb_bom_id': 'BOM-002'},
       'missing': {'esb_bom_id': 'NO-SUCH-ITEM'}}
records = []
for identifier, action, qty, item in [('made', 'Production', 10, 'recW1'),
        ('radiant', 'Transfer to Radiant', 3, 'recW1'), ('outlet', 'Transfer to RRS', 4, 'recW1'),
        ('missing-item', 'Transfer to Bungur', 2, 'missing'), ('missing-unit', 'Transfer to Bungur', 2, 'recW2')]:
    records.append({'id': identifier, 'fields': {'date': '2026-05-01T17:00:00Z',
        'action_type': action, 'qty_porsi': qty, 'wip_item': item, 'status': 'Approved'}})
rows, skips = history.collect(records, 'log', wip)
assert not skips
sql = history.build_sql(rows, 'org-a', 'retail_ops',
    'f1420000-0000-0000-0000-000000000001', 'f1420000-0000-0000-0000-000000000002')
body = sql.removeprefix('\\set ON_ERROR_STOP on\nbegin;\n').removesuffix('commit;\n')
fixture = pathlib.Path('supabase/tests/ops_42_cafe_location_import.sql').read_text()
assert fixture.split('$generated$')[1] == '\n' + body
PY
if [ $? -eq 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); fi
KITCHEN='f1410000-0000-0000-0000-000000000001'
OUTLET='f1410000-0000-0000-0000-000000000002'
check 'send ids required before loading' 2 --wip "$tmp/wip.json" --logs "$tmp/sends.json" --plans "$tmp/plans.json" --dry-run
check 'location arguments required together' 2 --wip "$tmp/wip.json" --logs "$tmp/logs.json" --plans "$tmp/plans.json" --dry-run --rames-kitchen-location "$KITCHEN"
check 'invalid location identifier refused' 2 --wip "$tmp/wip.json" --logs "$tmp/sends.json" --plans "$tmp/plans.json" --dry-run --rames-kitchen-location bad --rames-outlet-location "$OUTLET"
check 'same location identifier refused' 2 --wip "$tmp/wip.json" --logs "$tmp/sends.json" --plans "$tmp/plans.json" --dry-run --rames-kitchen-location "$KITCHEN" --rames-outlet-location "$KITCHEN"
check 'unapproved sends and send plans give non-clean exit' 3 --wip "$tmp/wip.json" --logs "$tmp/sends.json" --plans "$tmp/send-plans.json" --dry-run --rames-kitchen-location "$KITCHEN" --rames-outlet-location "$OUTLET"
python3 "$SCRIPT" --wip "$tmp/wip.json" --logs "$tmp/sends.json" --plans "$tmp/send-plans.json" --dry-run --allow-unresolved --rames-kitchen-location "$KITCHEN" --rames-outlet-location "$OUTLET" > "$tmp/sends.sql" 2> "$tmp/sends.report"
assert_contains 'send uses normal reviewed log action' "$tmp/sends.sql" '"action":"outlet_send"'
assert_contains 'send log captures source place' "$tmp/sends.sql" 'from_storage_location_id,to_storage_location_id'
assert_contains 'send ledger insert' "$tmp/sends.sql" 'insert into ops.location_movements'
assert_contains 'send SQL validates location availability' "$tmp/sends.sql" 'ops.location_branches'
assert_contains 'send SQL requires active storage' "$tmp/sends.sql" "l.use in ('storage','both')"
assert_contains 'send SQL requires confirmed units' "$tmp/sends.sql" 'confirmed_at is not null'
assert_contains 'send SQL uses import source' "$tmp/sends.sql" "'move', 'import'"
assert_contains 'non-Approved send reported' "$tmp/sends.report" 'send_not_approved'
assert_absent 'non-Approved send never emitted' "$tmp/sends.sql" 'send-pending'
assert_contains 'outlet send plans reported' "$tmp/sends.report" 'send_plan_not_loaded'
assert_absent 'outlet send plans never emitted' "$tmp/sends.sql" 'send-plan'
assert_absent 'send SQL never writes outbox' "$tmp/sends.sql" 'insert[[:space:]]+into[[:space:]]+integrations\.esb_push'
python3 - "$tmp/sends.sql" <<'PY'
import json
import pathlib
import sys
import uuid
sql = pathlib.Path(sys.argv[1]).read_text()
rows = json.loads(sql.split('$json$')[1])
sends = [row for row in rows if row['kind'] == 'move']
namespace = uuid.uuid5(uuid.NAMESPACE_URL, 'https://ops.gordi.id/mos#kitchen-history-import')
assert len(sends) == 2
assert {row['det_id'] for row in sends} == {str(uuid.uuid5(namespace, f'rames_send:{identifier}')) for identifier in ['send-rrs', 'send-bungur']}
PY
if [ $? -eq 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
