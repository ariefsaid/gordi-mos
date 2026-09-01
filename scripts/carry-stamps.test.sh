#!/usr/bin/env bash
# Self-test for scripts/carry-stamps.sh — pure rebases carry all four stamps; ANY content
# change refuses; unbound stamps refuse.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/carry-stamps.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
G() { git -C "$tmp/r" -c user.email=t@t -c user.name=t "$@"; }
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
     else fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; fi; }

git init -q -b dev "$tmp/r"
echo base > "$tmp/r/a"; G add a; G commit -qm base
G checkout -qb feat
echo one > "$tmp/r/b"; G add b; G commit -qm "one"
echo two > "$tmp/r/c"; G add c; G commit -qm "two"
OLD="$(G rev-parse HEAD)"
gd="$(G rev-parse --absolute-git-dir)"
printf '%s' "$OLD" > "$gd/pre-pr-verify-ok"
for l in spec code-quality security; do printf '%s %s rev now art\n' "$OLD" "$l" > "$gd/independent-review-$l-ok"; done

# dev moves; pure rebase
G checkout -q dev; echo moved > "$tmp/r/d"; G add d; G commit -qm moved
G checkout -q feat; G rebase -q dev
NEW="$(G rev-parse HEAD)"
(cd "$tmp/r" && bash "$SCRIPT" "$OLD" dev) >/dev/null 2>&1; t "pure rebase carries" $?
[ "$(cat "$gd/pre-pr-verify-ok")" = "$NEW" ]; t "verify stamp moved to new head" $?
[ "$(awk '{print $1}' "$gd/independent-review-security-ok")" = "$NEW" ]; t "lens stamp moved" $?

# content change during 'rebase' → refuse
OLD2="$NEW"
G commit -q --amend -m "one (edited)" --allow-empty 2>/dev/null || true
echo tampered >> "$tmp/r/b"; G add b; G commit -qm "tamper"
G rebase -q dev 2>/dev/null || true
if (cd "$tmp/r" && bash "$SCRIPT" "$OLD" dev) >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  changed content must refuse\n'
else pass=$((pass+1)); printf '  ok    changed content refuses\n'; fi

rm -f "$gd/pre-pr-verify-ok" "$gd"/independent-review-*-ok
if (cd "$tmp/r" && bash "$SCRIPT" "$OLD2" dev) >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  no bound stamps must refuse\n'
else pass=$((pass+1)); printf '  ok    no bound stamps refuses\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
