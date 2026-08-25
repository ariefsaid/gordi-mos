#!/usr/bin/env bash
# Self-test for #388: the e2e entry point holds the shared DB lock, and a naked
# run warns. Guard convention: every check proves it can fail.
set -euo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# 1. the npm e2e script routes through with-db-lock.sh
if grep -q '"e2e": "bash ../scripts/with-db-lock.sh playwright test"' mos-app/package.json; then
  ok "npm run e2e wraps with-db-lock.sh"
else bad "npm run e2e does not wrap the lock"; fi

# can-fail control: strip the wrapper from a copy of the REAL manifest — the same
# check against that copy must fail, proving check #1 tracks the file, not grep semantics.
stripped=$(sed 's|bash ../scripts/with-db-lock.sh playwright test|playwright test|' mos-app/package.json)
if printf '%s' "$stripped" | grep -q '"e2e": "bash ../scripts/with-db-lock.sh playwright test"'; then
  bad "control: the check passed against the stripped manifest"
else ok "control: the check fails against the stripped manifest"; fi

# 2. the lock wrapper exports the held-marker the warning keys on
if grep -q 'MOS_DB_LOCK_HELD' scripts/with-db-lock.sh; then
  ok "with-db-lock.sh carries the MOS_DB_LOCK_HELD marker"
else bad "lock wrapper lost its held-marker"; fi

# 3. global-setup warns on a naked local run (text pinned to the load-bearing phrase)
if grep -q 'RUNNING WITHOUT THE SHARED DB LOCK' mos-app/e2e/global-setup.ts &&
   grep -q 'MOS_DB_LOCK_HELD' mos-app/e2e/global-setup.ts; then
  ok "global-setup warns when the lock is not held"
else bad "global-setup naked-run warning missing"; fi

# 4. the warning stays quiet under CI (the guard reads the CI env)
if grep -q '!process.env.CI && !process.env.MOS_DB_LOCK_HELD' mos-app/e2e/global-setup.ts; then
  ok "warning is CI-quiet"
else bad "warning would fire in CI"; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
