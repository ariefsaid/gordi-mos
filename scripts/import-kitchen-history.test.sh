#!/usr/bin/env bash
# Self-test for scripts/import-kitchen-history.py — the kitchen history import (#349, OD-WAY-57).
# Hermetic: no database, no network. Guards the refusal paths (non-local DB URL), the export
# parsing (shapes, unknown action_type, superseded duplicates), and statically pins the generated
# SQL: it must load through the canonical catalog with ON CONFLICT DO NOTHING and must never
# write the integrations.esb_push outbox — the import can never create outbox work.
set -uo pipefail
cd "$(dirname "$0")/.."
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
 {"id":"recL1","createdTime":"2026-08-01T02:00:00.000Z","fields":{"date":"2026-08-01T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Production","qty_porsi":10,"status":"Approved","submitted_by":"Ansori","reviewed_by":"Riri","reviewed_at":"2026-08-01T09:30:00.000Z","posted_to_esb":true,"esb_doc_num":"ESB-HIST-1","posted_at":"2026-08-01T09:00:00.000Z","notes":"hift"}},
 {"id":"recL2","fields":{"date":"2026-08-02T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Fire Sale","qty_porsi":3,"status":"Approved"}},
 {"id":"recL3","fields":{"date":"2026-08-03T17:00:00.000Z","wip_item":{"id":"recW2"},"action_type":"Transfer to Radiant","qty_porsi":5,"status":"Approved","posted_to_esb":false}},
 {"id":"recL4","fields":{"date":"2026-08-04T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Transfer to GGS","qty_porsi":2,"status":"Submitted"}}]}
EOF
cat > "$tmp/plans.json" <<'EOF'
[{"id":"recP1","createdTime":"2026-08-01T01:00:00.000Z","fields":{"date":"2026-08-01T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Production","planned_qty":40,"plan_by":"Riri","notes":"shift plan"}},
 {"id":"recP2","createdTime":"2026-08-01T05:00:00.000Z","fields":{"date":"2026-08-01T17:00:00.000Z","wip_item":{"id":"recW1"},"action_type":"Production","planned_qty":45,"plan_by":"Riri"}}]
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

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
