#!/usr/bin/env bash
# Self-test for scripts/owner-assent.sh — commit-bound owner assent markers.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/owner-assent.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

g() { git -C "$tmp/repo" -c user.email=t@t -c user.name=t "$@"; }
git init -q "$tmp/repo"
printf 'fixture\n' > "$tmp/repo/file.txt"
g add file.txt && g commit -qm init
head="$(g rev-parse HEAD)"
git -C "$tmp/repo" worktree add -q -b linked "$tmp/linked" "$head"
common="$(git -C "$tmp/linked" rev-parse --path-format=absolute --git-common-dir)"
worktree_gitdir="$(git -C "$tmp/linked" rev-parse --path-format=absolute --git-dir)"
blob="$(g hash-object -w "$tmp/repo/file.txt")"

check_refused() { # $1 name · remaining args…
  local name="$1"; shift
  (cd "$tmp/linked" && bash "$SCRIPT" "$@") > "$tmp/out" 2>&1; local rc=$?
  if [ "$rc" -ne 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — expected refusal\n' "$name"; fi
}

check_refused 'unresolvable SHA refused' 0000000000000000000000000000000000000000 'owner said merge it'
check_refused 'HEAD revision refused even when it resolves to a commit' HEAD 'owner said merge it'
check_refused 'short SHA refused even when it resolves to a commit' "${head:0:12}" 'owner said merge it'
check_refused 'HEAD~0 revision refused even when it resolves to a commit' HEAD~0 'owner said merge it'
check_refused 'blob SHA that is not a commit refused' "$blob" 'owner said merge it'
check_refused 'empty quoted words refused' "$head" ''
check_refused 'whitespace-only quoted words refused' "$head" $' \t\n '

(cd "$tmp/linked" && bash "$SCRIPT" "$head" $'owner said merge\nthis exact commit') > "$tmp/out" 2>&1
rc=$?
marker="$common/owner-assent-$head"
if [ "$rc" -eq 0 ] && [ -f "$marker" ] && [ ! -e "$worktree_gitdir/owner-assent-$head" ] \
  && grep -Eq "^$head [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z owner said merge this exact commit$" "$marker" \
  && [ "$(wc -l < "$marker" | tr -d ' ')" = 1 ]; then
  pass=$((pass+1)); printf '  ok    full SHA marker uses common dir and records UTC time and words on one line\n'
else
  fail=$((fail+1)); printf '  FAIL  successful assent marker wrong — rc=%s, marker=%s, output=%s\n' "$rc" "$(cat "$marker" 2>/dev/null)" "$(tr '\n' ' ' < "$tmp/out")"
fi
if [ "$rc" -eq 0 ] && grep -Fq "$marker" "$tmp/out"; then
  pass=$((pass+1)); printf '  ok    successful assent prints the marker path\n'
else fail=$((fail+1)); printf '  FAIL  successful assent did not print marker path\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
