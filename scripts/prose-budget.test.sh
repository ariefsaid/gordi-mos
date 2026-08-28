#!/usr/bin/env bash
# Self-test for scripts/prose-budget.sh — refuse comment-essays, pass honest diffs, warn on
# markdown floods. Runs against scratch repos so every threshold is proven able to fail.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/prose-budget.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

mkrepo() { # fresh repo with a base commit; echoes path
  local r="$tmp/r$RANDOM"
  git init -q "$r"
  git -C "$r" -c user.email=t@t -c user.name=t commit -qm base --allow-empty
  git -C "$r" branch -q base
  echo "$r"
}
commit_file() { # $1 repo · $2 file · $3 content
  printf '%s\n' "$3" > "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" -c user.email=t@t -c user.name=t commit -qm change
}

check() { # $1 name · $2 expected rc · $3 repo · [$4 expect-warn yes/no]
  local name="$1" want="$2" repo="$3" wantwarn="${4:-}"
  local out rc
  out="$( (cd "$repo" && bash "$SCRIPT" base) 2>&1 )"; rc=$?
  local warn=no; printf '%s' "$out" | grep -q '⚠' && warn=yes
  if [ "$rc" -eq "$want" ] && { [ -z "$wantwarn" ] || [ "$warn" = "$wantwarn" ]; }; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s) warn=%s\n' "$name" "$rc" "$want" "$warn"
  fi
}

r=$(mkrepo); commit_file "$r" a.ts "$(seq 1 60 | sed 's/^/const x/')"
check "code-heavy diff passes clean" 0 "$r" no

r=$(mkrepo); commit_file "$r" a.ts "$(seq 1 60 | sed 's/^/\/\/ narration line /')
const one = 1"
check "60 comment lines on 1 code line refused" 1 "$r"

r=$(mkrepo); commit_file "$r" a.ts "$(seq 1 30 | sed 's/^/\/\/ why /')
$(seq 1 40 | sed 's/^/const y/')"
check "30 comments on 40 code = warn, not refuse" 0 "$r" yes

r=$(mkrepo); commit_file "$r" a.sql "$(seq 1 60 | sed 's/^/-- essay /')
select 1;"
check "sql -- comments counted" 1 "$r"

r=$(mkrepo); commit_file "$r" notes.md "$(seq 1 250 | sed 's/^/prose /')"
check "250 md lines warns" 0 "$r" yes

r=$(mkrepo); commit_file "$r" notes.md "$(seq 1 50 | sed 's/^/prose /')"
check "small md passes clean" 0 "$r" no

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
