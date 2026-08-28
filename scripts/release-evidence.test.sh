#!/usr/bin/env bash
# Self-test for scripts/release-evidence.sh — shipped-issue extraction, migration listing,
# and both refusal paths, in a scratch repo.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/release-evidence.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

g() { git -C "$tmp/r" -c user.email=t@t -c user.name=t "$@"; }
git init -q -b main "$tmp/r"
echo a > "$tmp/r/a"; g add a; g commit -qm "base"
g branch -q dev
g checkout -qb dev 2>/dev/null || g checkout -q dev
echo b > "$tmp/r/b"; g add b; g commit -qm "feat: first slice (#101)"
mkdir -p "$tmp/r/supabase/migrations"
echo "select 1;" > "$tmp/r/supabase/migrations/001_x.sql"; g add supabase; g commit -qm "feat(db): schema bit (#102)"
echo c > "$tmp/r/c"; g add c; g commit -qm "chore: no issue ref"
echo d > "$tmp/r/d"; g add d; g commit -qm "fix: pair landing (#9, #110)"
echo e > "$tmp/r/e"; g add e; g commit -qm "fix: zero-padded typo ref (#0007)"

out="$( (cd "$tmp/r" && bash "$SCRIPT" main dev) 2>&1 )"; rc=$?
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
      else fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "$out"; fi; }
[ "$rc" -eq 0 ]; t "exits 0 with content" $?
printf '%s' "$out" | grep -q "first slice (#101)"; t "shipped issue #101 listed" $?
printf '%s' "$out" | grep -q "schema bit (#102)"; t "shipped issue #102 listed" $?
printf '%s' "$out" | grep -q "supabase/migrations/001_x.sql"; t "migration listed" $?
printf '%s' "$out" | grep -q "5 commits"; t "commit count right" $?
printf '%s' "$out" | grep -q "^- #7 — fix: zero-padded typo ref (#0007)"; t "leading-zero ref canonicalized with its subject" $?
printf '%s' "$out" | grep -q "^- #9 " && printf '%s' "$out" | grep -q "^- #110 "; t "multi-ref subject yields both issues" $?
[ "$(printf '%s\n' "$out" | grep -n '^- #9 ' | cut -d: -f1)" -lt "$(printf '%s\n' "$out" | grep -n '^- #101' | cut -d: -f1)" ]; t "numeric order (#9 before #101), no GNU sort -V" $?

if (cd "$tmp/r" && bash "$SCRIPT" main no-such-branch) >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  bad ref must refuse\n'
else pass=$((pass+1)); printf '  ok    bad ref refuses\n'; fi
if (cd "$tmp/r" && bash "$SCRIPT" dev dev) >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  empty window must refuse\n'
else pass=$((pass+1)); printf '  ok    empty window refuses\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
