#!/usr/bin/env bash
# Self-test for scripts/esb-worker.py — the ESB push worker (#134).
#
# Hermetic: no database, no network, no ERP. Every case runs `--plan --rows-from`, which
# composes and guards a row and prints what it WOULD send. The hosts handed to it are
# .invalid on purpose: if any case ever reached the network it would fail loudly rather
# than quietly succeed against something real.
#
# THE CASE THIS FILE EXISTS FOR is section D. The pre-flip ERP target is a shared,
# multi-tenant vendor sandbox holding test data only (FR-084), and the worker's guarantee
# is that a real ERP identifier cannot reach it. A test that only showed the identifier
# absent would pass just as well against a worker that sends nothing at all, so the SAME
# identifier is asserted twice: absent from the sandbox request, present in the ERP-of-
# record request. The assertion flips with the environment, which is what makes it
# evidence rather than decoration.
#
# The identifiers below are FABRICATED. This repo is public and real ERP coordinates do
# not belong in it — and none are needed: the worker's guard is an allow-by-mapping, so
# any unmapped id is refused by the same code path a real one would be.
set -uo pipefail
cd "$(dirname "$0")/.."
# Hermeticity is enforced, not assumed: a leaked variable from the operator's shell must
# not turn a refusal case into a real drain (the lesson from import-kitchen-history).
unset ESB_WORKER_TARGET_ENV ESB_WORKER_MAP_FILE ESB_BASE_URL ESB_USERNAME ESB_PASSWORD \
      ESB_PUSH_ENABLED ESB_ALLOW_GKID ESB_MAX_RETRY ESB_MAX_ROWS ESB_HTTP_TIMEOUT \
      MOS_SUPABASE_URL MOS_SUPABASE_SERVICE_ROLE_KEY
SCRIPT="$(pwd)/scripts/esb-worker.py"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

# A production-shaped WIP identifier pair, standing in for one that names a real ERP
# record. Fabricated (see header).
PROD_BOM=4471
PROD_PDID=8823
# The sandbox's own identifiers, from its own tenant. Also fabricated.
SANDBOX_BOM=131
SANDBOX_PDID=97

run() { # env-assignments... -- args...   → sets $out and $rc
  local -a envs=() ; while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
  out=$(env "${envs[@]}" python3 "$SCRIPT" "$@" 2>&1); rc=$?
}

ok()   { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "${2:-}"; }

expect_rc() { # $1 name · $2 expected rc
  if [ "$rc" -eq "$2" ]; then ok "$1"; else bad "$1" "expected rc=$2 got rc=$rc
$out"; fi
}
expect_has() { # $1 name · $2 needle
  if printf '%s' "$out" | grep -Fq -- "$2"; then ok "$1"
  else bad "$1" "missing: $2
$out"; fi
}
expect_lacks() { # $1 name · $2 needle
  if printf '%s' "$out" | grep -Fq -- "$2"; then bad "$1" "present but must not be: $2
$out"
  else ok "$1"; fi
}

# ── fixtures ──────────────────────────────────────────────────────────────────────────
WIP=11111111-2222-3333-4444-555555555555

# The sandbox map. Note what is NOT in it: the production identifiers. It translates the
# MOS item to the sandbox tenant's own ids, so the production ones are never read.
cat > "$tmp/goo.json" <<EOF
{"target_env":"goo",
 "branches":{"rumah_rames":{"branch_id":176,"location_id":510},
             "radiant":{"branch_id":176,"location_id":511}},
 "items":{"$WIP":{"bom_id":$SANDBOX_BOM,"product_detail_id":$SANDBOX_PDID}}}
EOF
# The same map with the item removed — an item nobody has enrolled in the sandbox.
cat > "$tmp/goo-unmapped.json" <<EOF
{"target_env":"goo",
 "branches":{"rumah_rames":{"branch_id":176,"location_id":510}},
 "items":{}}
EOF
# The ERP of record: its identifiers ARE the payload's, so the map says so explicitly.
cat > "$tmp/gkid.json" <<EOF
{"target_env":"gkid",
 "branches":{"rumah_rames":{"branch_id":8,"location_id":15},
             "radiant":{"branch_id":4,"location_id":7}},
 "items":"from-payload"}
EOF
# The same passthrough asked for on the sandbox — refused at load.
cat > "$tmp/goo-passthrough.json" <<EOF
{"target_env":"goo",
 "branches":{"rumah_rames":{"branch_id":176,"location_id":510}},
 "items":"from-payload"}
EOF
echo '{oops' > "$tmp/broken.json"

# One approved production movement, exactly the shape ops.approve_kitchen_log enqueues.
row() { # $1 endpoint · $2 target_env · $3 dest branch code
cat <<EOF
[{"id":"aaaaaaaa-0000-0000-0000-000000000001","org_id":"00000000-0000-0000-0000-0000000000a1",
  "source_module":"kitchen","source_ref":"PR-20260820-001","endpoint":"$1",
  "target_env":"$2","status":"pending","retry_count":0,
  "payload":{"batch_id":"PR-20260820-001","log_date":"2026-08-20","wip_item_id":"$WIP",
             "esb_bom_id":$PROD_BOM,"esb_product_detail_id_porsi":$PROD_PDID,
             "qty_porsi":12,"action":"$( [ "$1" = "assembly-actual" ] && echo produce || echo transfer )",
             "activity":"kitchen","branch_id":"00000000-0000-0000-0000-0000000000b1",
             "branch_code":"rumah_rames",
             "destination_branch_id":"00000000-0000-0000-0000-0000000000b2",
             "destination_branch_code":"$3"}}]
EOF
}
row assembly-actual goo    rumah_rames > "$tmp/produce-goo.json"
row assembly-actual gkid   rumah_rames > "$tmp/produce-gkid.json"
row simple-transfer goo    radiant     > "$tmp/transfer-goo.json"
row noop            goo    rumah_rames > "$tmp/noop-goo.json"
row rocket-launch   goo    radiant     > "$tmp/unknown-goo.json"

GOO_ENV=(ESB_WORKER_TARGET_ENV=goo ESB_WORKER_MAP_FILE="$tmp/goo.json")
GKID_ENV=(ESB_WORKER_TARGET_ENV=gkid ESB_ALLOW_GKID=1 ESB_WORKER_MAP_FILE="$tmp/gkid.json")

# ══════════════════════════════════════════════════════════════════════════════════════
echo "A. configuration refusals — nothing drains until the setup is coherent"
# ══════════════════════════════════════════════════════════════════════════════════════
run ESB_WORKER_TARGET_ENV=gkid ESB_WORKER_MAP_FILE="$tmp/gkid.json" -- --plan --rows-from "$tmp/produce-gkid.json"
expect_rc   "the ERP of record is refused without the owner-gated flip flag" 2
expect_has  "...and says which flag" "ESB_ALLOW_GKID"

run "${GKID_ENV[@]}" -- --plan --rows-from "$tmp/produce-gkid.json"
expect_rc   "...and is allowed once the flag is set" 0

run ESB_WORKER_TARGET_ENV=goo -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc   "no id map is refused (ERP branch ids are per-environment config)" 2

run ESB_WORKER_TARGET_ENV=goo ESB_WORKER_MAP_FILE="$tmp/gkid.json" -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc   "one environment's map cannot be used against another" 2

run ESB_WORKER_TARGET_ENV=goo ESB_WORKER_MAP_FILE="$tmp/broken.json" -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc   "a malformed id map is refused" 2

run ESB_WORKER_TARGET_ENV=orbit ESB_WORKER_MAP_FILE="$tmp/goo.json" -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc   "an unknown target environment is refused" 2

run "${GOO_ENV[@]}" ESB_PUSH_ENABLED=1 -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc   "a real push with this environment's credentials unset is refused" 2
expect_has  "...and does not offer to borrow another environment's" "never borrows"

# ══════════════════════════════════════════════════════════════════════════════════════
echo "B. the sandbox may not ask for the real ERP's identifiers"
# ══════════════════════════════════════════════════════════════════════════════════════
run ESB_WORKER_TARGET_ENV=goo ESB_WORKER_MAP_FILE="$tmp/goo-passthrough.json" -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc   "a sandbox map asking to pass the payload's ids through is refused at load" 2
expect_has  "...naming the rule" "only the ERP of record may receive them"

# ══════════════════════════════════════════════════════════════════════════════════════
echo "C. a row belongs to the environment it was stamped for"
# ══════════════════════════════════════════════════════════════════════════════════════
run "${GOO_ENV[@]}" -- --plan --rows-from "$tmp/produce-gkid.json"
expect_rc   "a row stamped for another environment is refused" 3
expect_has  "...and says so" "REFUSED"
expect_lacks "...and composes no request for it" "POST /production"

# ══════════════════════════════════════════════════════════════════════════════════════
echo "D. THE SAFETY LINE — the same production identifier, refused then transmitted"
# ══════════════════════════════════════════════════════════════════════════════════════
# D1. sandbox, item not enrolled → refused outright. The production ids are on the
#     payload and go nowhere.
run ESB_WORKER_TARGET_ENV=goo ESB_WORKER_MAP_FILE="$tmp/goo-unmapped.json" -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc    "an unmapped item is refused, not sent" 3
expect_has   "...explaining that the sandbox holds test data only" "test data only"
expect_lacks "...and no request is composed at all" "POST /production"
expect_lacks "...so the production BOM id ($PROD_BOM) goes nowhere" "$PROD_BOM"
expect_lacks "...nor the production product-detail id ($PROD_PDID)" "$PROD_PDID"

# D2. sandbox, item enrolled → a request IS composed, and it carries the SANDBOX's ids.
#     The production ids are still absent, which is the point: mapping replaced them.
run "${GOO_ENV[@]}" -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc    "a mapped item composes a request" 0
expect_has   "...against the sandbox BOM id ($SANDBOX_BOM)" "\"bomID\": $SANDBOX_BOM"
expect_has   "...and the sandbox product-detail id ($SANDBOX_PDID)" "\"productDetailID\": $SANDBOX_PDID"
expect_has   "...reading materials from the sandbox BOM, not the real one" "/product/bom/$SANDBOX_BOM"
expect_lacks "...with the production BOM id ($PROD_BOM) nowhere in the request" "$PROD_BOM"
expect_lacks "...nor the production product-detail id ($PROD_PDID)" "$PROD_PDID"

# D3. THE FALSIFIER. Same row, same code path, the ERP of record — and now the very
#     identifier D1/D2 asserted absent is present. Without this case those two
#     assertions would pass against a worker that transmits nothing.
run "${GKID_ENV[@]}" -- --plan --rows-from "$tmp/produce-gkid.json"
expect_rc    "the ERP of record composes a request" 0
expect_has   "...carrying the production BOM id ($PROD_BOM) — so D1/D2's absence is real" "\"bomID\": $PROD_BOM"
expect_has   "...and the production product-detail id ($PROD_PDID)" "\"productDetailID\": $PROD_PDID"
expect_lacks "...and none of the sandbox's ids leak into it" "/product/bom/$SANDBOX_BOM"

# ══════════════════════════════════════════════════════════════════════════════════════
echo "E. the endpoints the schema derives, and the one it does not"
# ══════════════════════════════════════════════════════════════════════════════════════
run "${GOO_ENV[@]}" -- --plan --rows-from "$tmp/transfer-goo.json"
expect_rc   "a transfer between branches composes a transfer" 0
expect_has  "...from the origin branch's location" "\"originLocationID\": 510"
expect_has  "...to the destination branch's location" "\"destinationLocationID\": 511"

run "${GOO_ENV[@]}" -- --plan --rows-from "$tmp/noop-goo.json"
expect_rc   "an intra-branch movement is clean" 0
expect_has  "...and owes the ERP no document" "no ERP document"
expect_lacks "...so nothing is posted for it" "POST /"

run "${GOO_ENV[@]}" -- --plan --rows-from "$tmp/unknown-goo.json"
expect_rc   "an endpoint this worker does not know is refused" 3
expect_has  "...rather than guessed at" "will not invent a route"

# ══════════════════════════════════════════════════════════════════════════════════════
echo "F. --plan reaches nothing"
# ══════════════════════════════════════════════════════════════════════════════════════
# Every case above already ran with no ESB_BASE_URL and no Supabase coordinates set. This
# one hands it hosts that cannot resolve: if --plan ever opened a connection, it would
# surface here instead of on the day somebody rehearses against production by accident.
run "${GOO_ENV[@]}" ESB_BASE_URL=https://erp.example.invalid \
    MOS_SUPABASE_URL=https://db.example.invalid MOS_SUPABASE_SERVICE_ROLE_KEY=not-a-key \
    -- --plan --rows-from "$tmp/produce-goo.json"
expect_rc   "--plan with unreachable hosts still succeeds — it never dialled them" 0

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
