#!/usr/bin/env bash
# Self-test for scripts/seed-cafe-usage-settings.py — Café settings from recent ERP usage.
# Hermetic: no database, no network, made-up ids only. Guards the refusal paths, the rolling
# window, the usage query's definition of "used", and statically pins the generated SQL: only
# untouched rows are written, shown units go in before the default, written rows carry run-derived
# ids, nothing is deactivated or deleted by a seed, and the rollback reverses only unedited rows.
set -uo pipefail
cd "$(dirname "$0")/.."
unset CAFE_USAGE_SEED_DB_URL
SCRIPT="$(pwd)/scripts/seed-cafe-usage-settings.py"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

check() { # $1 name · $2 expected exit code · then script args
  local name="$1" expect="$2"; shift 2
  local out rc
  out=$(python3 "$SCRIPT" "$@" 2>&1); rc=$?
  if [ "$rc" -eq "$expect" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — expected rc=%d got rc=%d\n%s\n' "$name" "$expect" "$rc" "$out"; fi
}
assert_contains() { # $1 name · $2 file · $3 fixed string
  if grep -Fq -- "$3" "$2"; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL  %s — %s missing from %s\n' "$1" "$3" "$2"; fi
}
assert_absent() { # $1 name · $2 file · $3 regex that must NOT match
  if grep -Eiq -- "$3" "$2"; then fail=$((fail+1)); printf '  FAIL  %s — %s matched %s\n' "$1" "$2" "$3"
  else pass=$((pass+1)); printf '  ok    %s\n' "$1"; fi
}
assert_before() { # $1 name · $2 file · $3 earlier fixed string · $4 later fixed string
  local a b
  a=$(grep -nF -- "$3" "$2" | head -1 | cut -d: -f1); b=$(grep -nF -- "$4" "$2" | head -1 | cut -d: -f1)
  if [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL  %s — %s not before %s\n' "$1" "$3" "$4"; fi
}

LOCAL_URL='postgresql://postgres:postgres@127.0.0.1:44322/postgres'
REMOTE_URL='postgresql://postgres:secretpw@db.example.invalid:5432/postgres'
COMMON=(--esb-code TEST --branch-map 11=branch_a,12=branch_b --as-of 2026-03-31)

# Window for as-of 2026-03-31 is 2026-03-01 ..< 2026-03-31.
cat > "$tmp/usage.jsonl" <<'EOF'
 {"branch_erp_id":11,"activity":"kitchen","erp_product_id":"501","erp_detail_id":"9001","use_count":7,"last_used":"2026-03-30"}
 {"branch_erp_id":11,"activity":"kitchen","erp_product_id":"501","erp_detail_id":"9002","use_count":2,"last_used":"2026-03-02"}
 {"branch_erp_id":12,"activity":"bar","erp_product_id":"502","erp_detail_id":"9003","use_count":1,"last_used":"2026-03-01"}
EOF
printf '[{"branch_erp_id":99,"activity":"bar","erp_product_id":"1","erp_detail_id":"2","use_count":1,"last_used":"2026-03-05"}]' > "$tmp/unmapped.json"
printf '[{"branch_erp_id":11,"activity":"bar","erp_product_id":"1","erp_detail_id":"2","use_count":1,"last_used":"2026-03-31"}]' > "$tmp/late.json"
printf '[{"branch_erp_id":11,"activity":"b2b","erp_product_id":"1","erp_detail_id":"2","use_count":1,"last_used":"2026-03-05"}]' > "$tmp/b2b.json"

# ── refusals ────────────────────────────────────────────────────────────────────────────────
check "non-local db url refused"            2 "${COMMON[@]}" --usage "$tmp/usage.jsonl" --db-url "$REMOTE_URL" --dry-run
check "remote url passes with --allow-remote" 0 "${COMMON[@]}" --usage "$tmp/usage.jsonl" --db-url "$REMOTE_URL" --allow-remote --dry-run
check "localhost passes the guard"          0 "${COMMON[@]}" --usage "$tmp/usage.jsonl" --db-url "$LOCAL_URL" --dry-run
check "db url required for a real run"      2 "${COMMON[@]}" --usage "$tmp/usage.jsonl"
check "real run needs a manifest"           2 "${COMMON[@]}" --usage "$tmp/usage.jsonl" --db-url "$LOCAL_URL" --psql /nonexistent/psql
check "esb code required"                   2 --branch-map 11=branch_a --usage "$tmp/usage.jsonl" --dry-run
check "malformed branch map refused"        2 --esb-code TEST --branch-map 11:branch_a --usage "$tmp/usage.jsonl" --dry-run
check "two ERP branches on one MOS branch refused" 2 --esb-code TEST --branch-map 11=a,12=a --usage "$tmp/usage.jsonl" --dry-run
check "usage source required"               2 "${COMMON[@]}" --dry-run
check "unmapped ERP branch refused"         2 "${COMMON[@]}" --usage "$tmp/unmapped.json" --dry-run
check "usage on the run date refused (partial day)" 2 "${COMMON[@]}" --usage "$tmp/late.json" --dry-run
check "non-Café activity refused"           2 "${COMMON[@]}" --usage "$tmp/b2b.json" --dry-run
check "bad label refused"                   2 "${COMMON[@]}" --usage "$tmp/usage.jsonl" --label 'X;drop' --dry-run

# ── the ERP usage query: rolling window and the definition of "used" ────────────────────────
python3 "$SCRIPT" "${COMMON[@]}" --print-usage-sql > "$tmp/usage.sql"
assert_contains "window starts 30 days back"    "$tmp/usage.sql" "document_date >= date '2026-03-01'"
assert_contains "window ends before run date"   "$tmp/usage.sql" "document_date < date '2026-03-31'"
assert_contains "only mapped ERP branches"      "$tmp/usage.sql" "branch_id IN (11,12)"
assert_contains "POS sales count when issued"   "$tmp/usage.sql" "sm.transaction_type = 'POS Sales' AND sm.qty_out > 0"
assert_contains "manufacturing and transfers count" "$tmp/usage.sql" "IN ('Simple Manufacturing','Simple Transfer')"
assert_contains "activity from subcategory"     "$tmp/usage.sql" "lower(p.sub_category_name) IN ('bar','kitchen')"
assert_absent  "receipts and counts are not usage" "$tmp/usage.sql" "Goods Receipt|Stock Opname|Item Journal"
assert_absent  "usage query is read-only"       "$tmp/usage.sql" '(^|[^_a-z])(insert|update|delete|create|drop|alter|lock)[[:space:]]'

# ── --erp-query-cmd receives the query and its JSON lines are used ──────────────────────────
cat > "$tmp/fake-erp.sh" <<EOF
#!/usr/bin/env bash
printf '%s' "\$1" > "$tmp/received.sql"
cat "$tmp/usage.jsonl"
EOF
chmod +x "$tmp/fake-erp.sh"
check "erp query command feeds the run"     0 "${COMMON[@]}" --erp-query-cmd "bash $tmp/fake-erp.sh" --dry-run
assert_contains "erp query command got the usage SQL" "$tmp/received.sql" "FROM public.stock_movement sm"

# ── generated seed SQL pinned statically ────────────────────────────────────────────────────
python3 "$SCRIPT" "${COMMON[@]}" --usage "$tmp/usage.jsonl" --dry-run > "$tmp/seed.sql" 2>/dev/null
assert_contains "one transaction"               "$tmp/seed.sql" "begin;"
assert_contains "commits at the end"            "$tmp/seed.sql" "commit;"
assert_contains "sample org never a target"     "$tmp/seed.sql" "not shared.is_sample_org(id)"
assert_contains "catalog and settings locked"   "$tmp/seed.sql" "in share row exclusive mode"
assert_contains "most-used detail wins"         "$tmp/seed.sql" "order by u.use_count desc, u.last_used desc, u.erp_detail_id::bigint"
assert_contains "unit matched by ERP detail id" "$tmp/seed.sql" "unit.esb_product_detail_id = u.erp_detail_id and unit.source_active"
assert_contains "fence: never edited"           "$tmp/seed.sql" "s.updated_at = s.created_at"
assert_contains "fence: nothing set"            "$tmp/seed.sql" "s.default_item_unit_id is null and s.kind is null and not s.is_active"
assert_contains "fence: no name or multiples"   "$tmp/seed.sql" "s.mos_name is null and s.unit_multiples = array[]::numeric[]"
assert_contains "fence: no shown units"         "$tmp/seed.sql" "not exists (select 1 from ops.cafe_item_setting_units shown"
assert_contains "new rows carry a run-derived id" "$tmp/seed.sql" "md5('mos-cafe-usage-seed:' || 'usage-seed-2026-03-31' || ':' || c.org_id"
assert_contains "shown rows carry a run-derived id" "$tmp/seed.sql" "md5('mos-cafe-usage-seed:' || 'usage-seed-2026-03-31' || ':shown:'"
assert_contains "existing rows never overwritten" "$tmp/seed.sql" "on conflict (org_id, branch_id, activity, wip_item_id) do nothing"
assert_before  "shown unit inserted before the default" "$tmp/seed.sql" "insert into ops.cafe_item_setting_units" "update ops.cafe_item_settings s"
assert_contains "kind comes from the item"      "$tmp/seed.sql" "kind = t.item_kind"
assert_absent  "seed never deactivates"         "$tmp/seed.sql" 'is_active = false'
assert_absent  "seed never deletes"             "$tmp/seed.sql" '(^|[^_a-z])delete[[:space:]]+from'
assert_absent  "seed never writes items or units" "$tmp/seed.sql" '(insert[[:space:]]+into|update)[[:space:]]+ops\.(wip_items|item_units|stream_items)'
python3 "$SCRIPT" "${COMMON[@]}" --usage "$tmp/usage.jsonl" --dry-run --no-commit > "$tmp/rehearse.sql" 2>/dev/null
assert_contains "--no-commit ends in rollback"  "$tmp/rehearse.sql" "rollback;"
assert_absent  "--no-commit never commits"      "$tmp/rehearse.sql" '^commit;'

# ── rollback SQL ────────────────────────────────────────────────────────────────────────────
cat > "$tmp/manifest.json" <<'EOF'
{"label":"usage-seed-2026-03-31","run_at":"2026-03-31T01:02:03.456789+00:00",
 "updated_existing":["00000000-0000-4000-8000-000000000001"]}
EOF
python3 "$SCRIPT" --rollback "$tmp/manifest.json" --dry-run > "$tmp/rollback.sql"
assert_contains "rollback only touches rows written at run time" "$tmp/rollback.sql" "s.updated_at = '2026-03-31T01:02:03.456789+00:00'::timestamptz"
assert_contains "rollback keeps rows given a name or multiples" "$tmp/rollback.sql" "s.mos_name is null and s.unit_multiples = array[]::numeric[]"
assert_contains "rollback keeps rows with other shown units" "$tmp/rollback.sql" "shown.id <> md5("
assert_contains "rollback resets listed existing rows" "$tmp/rollback.sql" "00000000-0000-4000-8000-000000000001"
assert_contains "rollback deletes only new rows" "$tmp/rollback.sql" "where s.id in (select id from _undo where is_new)"
assert_before  "rollback clears the default before hiding its unit" "$tmp/rollback.sql" "set default_item_unit_id = null" "delete from ops.cafe_item_setting_units"
printf '{"label":"Bad Label","run_at":"2026-03-31T00:00:00+00:00","updated_existing":[]}' > "$tmp/bad-manifest.json"
check "rollback refuses a bad manifest"     2 --rollback "$tmp/bad-manifest.json" --dry-run
check "rollback refuses a remote db"        2 --rollback "$tmp/manifest.json" --db-url "$REMOTE_URL"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
