#!/usr/bin/env bash
# Self-test for scripts/db-contracts-scope.sh on a throwaway repo (no network, no DB).
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/db-contracts-scope.sh"
tmp=$(mktemp -d -t dbscope.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
git init -q -b main .
git config user.email t@t; git config user.name t
mkdir -p supabase/migrations mos-app/src docs
echo "select 1;" > supabase/migrations/20260101000000_a.sql
echo x > mos-app/src/x.tsx
echo '{}' > mos-app/package-lock.json
git add -A; git commit -qm base

fail=0
expect() {
  git add -A; git commit -qm "$2"
  out="$("$script" HEAD~1..HEAD)"
  got=skip; [ -n "$out" ] && got=run
  if [ "$got" = "$1" ]; then echo "  ok    $2"; else echo "  FAIL  $2 (want $1, got $got)"; fail=1; fi
}

echo y >> mos-app/src/x.tsx;                                   expect skip "UI-only"
echo '{"a":1}' > mos-app/package-lock.json;                    expect run  "package-lock"
git mv supabase/migrations/20260101000000_a.sql docs/a.sql;    expect run  "rename out of supabase/"
echo "select 2;" > "supabase/migrations/20260301000000_café.sql"; expect run  "non-ASCII migration name"
echo hi > docs/b.md;                                           expect skip "docs-only"

if [ "$fail" = 0 ]; then echo "db-contracts-scope self-test: all passed"; else echo "db-contracts-scope self-test: FAILED"; exit 1; fi
