#!/usr/bin/env bash
# Self-test for scripts/mcp-catalog.sh. No docker, no DB: it renders a fixture catalog. The full
# comparison against a live database is `bash scripts/mcp-catalog.sh --check`, run by db-contracts.yml.
set -euo pipefail
cd "$(dirname "$0")/.."

pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

tmp=$(mktemp -d -t mcpcat.XXXXXX)
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/catalog.json" <<'JSON'
[{"name":"whoami","comment":"Purpose: who is calling. Inputs: none. Returns: {person}. Errors: none expected.","args":[]},
 {"name":"refused_action","comment":"Purpose: refuse. Inputs: action. Always raises: refused.money.","args":[{"name":"action","type":"text","required":true}]}]
JSON
run() { MOS_API_CATALOG_JSON="$tmp/catalog.json" bash scripts/mcp-catalog.sh "$@" > /dev/null 2>&1; }

run --out "$tmp/out.ts" && grep -q '"name": "whoami"' "$tmp/out.ts" && grep -q 'Always raises: refused.money' "$tmp/out.ts" \
  && ok "renders each operation with its documented parts" || bad "render of the fixture is wrong"
run --check --out "$tmp/out.ts" && ok "--check passes on a fresh render" || bad "--check failed on a fresh render"
echo "// stale" >> "$tmp/out.ts"
run --check --out "$tmp/out.ts" && bad "--check passed on a stale file" || ok "--check fails on a stale file"
echo '[{"name":"x","comment":"no structure","args":[]}]' > "$tmp/bad.json"
MOS_API_CATALOG_JSON="$tmp/bad.json" bash scripts/mcp-catalog.sh --out "$tmp/bad.ts" > /dev/null 2>&1 \
  && bad "accepted an undocumented function" || ok "rejects an undocumented function"
echo '[]' > "$tmp/empty.json"
MOS_API_CATALOG_JSON="$tmp/empty.json" bash scripts/mcp-catalog.sh --out "$tmp/empty.ts" > /dev/null 2>&1 \
  && bad "wrote an empty catalog" || ok "refuses an empty catalog"

# The db-contracts lane must run the catalog freshness checks when only a catalog script changes.
re=$(sed -n "s/^ *CATALOG_INPUTS_RE='\(.*\)'$/\1/p" .github/workflows/db-contracts.yml)
[ -n "$re" ] || bad "db-contracts.yml names no catalog-script path pattern"
for path in scripts/mcp-catalog.sh scripts/api-reference.sh scripts/lib/api-catalog.sql; do
  printf '%s\n' "$path" | grep -Eq "$re" && ok "db-contracts runs the catalog checks when $path changes" \
    || bad "db-contracts ignores a change to only $path"
done
printf '%s\n' scripts/other.sh | grep -Eq "$re" && bad "the catalog pattern matches an unrelated script" \
  || ok "an unrelated script change does not trigger the catalog checks"
grep -q 'CATALOG_INPUTS" \]' .github/workflows/db-contracts.yml \
  && ok "the scope step boots the stack on a catalog-script change" || bad "the scope step does not use the catalog-script match"

echo "mcp-catalog: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
