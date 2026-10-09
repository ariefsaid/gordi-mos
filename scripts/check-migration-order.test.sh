#!/usr/bin/env bash
# Self-test for check-migration-order.sh, run against a throwaway git repo.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-migration-order.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
git init -q -b dev .
git config user.email t@t.test
git config user.name t
mkdir -p supabase/migrations
echo 'select 1;' > supabase/migrations/20260101000001_a.sql
echo 'select 1;' > supabase/migrations/20260201000001_b.sql
git add -A && git commit -qm base

pass=0
expect() { # <label> <want-rc> <new-file...>
  local label="$1" want="$2"; shift 2
  git checkout -q -B pr dev
  for f in "$@"; do echo 'select 1;' > "supabase/migrations/$f"; done
  [ "$#" -gt 0 ] && { git add -A && git commit -qm pr; }
  local rc=0 out
  out="$(bash "$SCRIPT" dev 2>&1)" || rc=$?
  if [ "$rc" -ne "$want" ]; then echo "FAIL $label: rc=$rc want=$want"; echo "$out"; exit 1; fi
  if [ "$want" -eq 1 ]; then
    grep -q "next free: 20260201000002" <<<"$out" || { echo "FAIL $label: no next-free version"; echo "$out"; exit 1; }
    grep -q "$1" <<<"$out" || { echo "FAIL $label: offender not named"; echo "$out"; exit 1; }
  fi
  echo "ok   $label"; pass=$((pass + 1))
}

expect "later version passes" 0 20260301000001_c.sql
expect "equal version fails" 1 20260201000001_c.sql
expect "earlier version fails" 1 20260115000001_c.sql
expect "no new migrations passes" 0
# Merge-time use: judge a PR head that is not checked out (the gh pr merge hook).
git checkout -q -B late dev; echo 'select 1;' > supabase/migrations/20260115000001_c.sql; git add -A; git commit -qm late
git checkout -q dev
rc=0; out="$(bash "$SCRIPT" dev late 2>&1)" || rc=$?
[ "$rc" -eq 1 ] && grep -q "next free: 20260201000002" <<<"$out" || { echo "FAIL explicit head ref not judged: rc=$rc"; echo "$out"; exit 1; }
echo "ok   explicit head ref is judged without checking it out"; pass=$((pass + 1))
rc=0; out="$(bash "$SCRIPT" dev no-such-ref 2>&1)" || rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL unknown head ref passed as ok"; echo "$out"; exit 1; }
echo "ok   an unknown ref fails instead of passing"; pass=$((pass + 1))
git checkout -q --orphan unrelated; git rm -rqf . >/dev/null; mkdir -p supabase/migrations; echo 'select 1;' > supabase/migrations/20250101000001_old.sql; git add -A; git commit -qm unrelated; git checkout -q dev
rc=0; out="$(bash "$SCRIPT" dev unrelated 2>&1)" || rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL unrelated history passed as ok"; echo "$out"; exit 1; }
echo "ok   unrelated histories fail"; pass=$((pass + 1))
git checkout -q -B tab dev; printf 'select 1;' > "supabase/migrations/20260115000001_t$(printf '\t')ab.sql"; git add -A; git commit -qm tab; git checkout -q dev
rc=0; out="$(bash "$SCRIPT" dev tab 2>&1)" || rc=$?
[ "$rc" -eq 1 ] || { echo "FAIL out-of-order tab path passed"; echo "$out"; exit 1; }
echo "ok   a path with a tab is still judged"; pass=$((pass + 1))
git checkout -q -B long dev; echo 'select 1;' > supabase/migrations/100000000000000_long.sql; git add -A; git commit -qm long; git checkout -q dev
rc=0; out="$(bash "$SCRIPT" dev long 2>&1)" || rc=$?
[ "$rc" -eq 1 ] || { echo "FAIL a non-14-digit version passed"; echo "$out"; exit 1; }
echo "ok   a version off the 14-digit format fails (filename order is text order)"; pass=$((pass + 1))
echo "$pass/9 passed"
