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
echo "$pass/4 passed"
