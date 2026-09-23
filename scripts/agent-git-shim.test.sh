#!/usr/bin/env bash
# Self-test for scripts/agent-git-shim/git — bypass flags blocked on hook-carrying
# subcommands (including bundled short flags), harmless -n uses pass through.
set -uo pipefail
cd "$(dirname "$0")/.."
SHIM="$(pwd)/scripts/agent-git-shim/git"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

check() { # $1 name · $2 blocked|allowed · then the git args
  local name="$1" expect="$2"; shift 2
  local out rc
  out=$( (cd "$tmp/repo" && bash "$SHIM" "$@") 2>&1 ); rc=$?
  local blocked=no; [[ $rc -eq 1 && "$out" == *"blocked: git hook bypass"* ]] && blocked=yes
  if [[ "$expect" == blocked && $blocked == yes ]] || [[ "$expect" == allowed && $blocked == no ]]; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — expected %s (rc=%d)\n        %s\n' "$name" "$expect" "$rc" "$out"
  fi
}

git init -q "$tmp/repo"
git -C "$tmp/repo" config user.email t@t && git -C "$tmp/repo" config user.name t
echo x > "$tmp/repo/f"; git -C "$tmp/repo" add f; git -C "$tmp/repo" commit -qm init
git init -q --bare "$tmp/origin.git"
git -C "$tmp/repo" remote add origin "$tmp/origin.git"

check "commit --no-verify"            blocked commit --no-verify -m x
check "commit -n"                     blocked commit -n -m x
check "commit -nm (bundled)"          blocked commit -nm x
check "commit -anm (bundled deeper)"  blocked commit -anm x
check "push --no-verify"              blocked push --no-verify origin HEAD:main
check "commit -C path prefix caught"  blocked -C . commit --no-verify -m x
check "--no-veri (prefix abbreviation)" blocked commit --no-veri -m x
check "-c core.hooksPath override"    blocked -c core.hooksPath=/dev/null commit -m x
check "-c core.HooksPath case-insensitive" blocked -c core.HooksPath=/dev/null commit -m x

check "plain commit"                  allowed commit --allow-empty -m ok
check "log -n 1"                      allowed log -n 1
check "git -C . log -n 1"             allowed -C . log -n 1
check "push -n (dry-run, not bypass)" allowed push -n origin HEAD:main
check "merge -n (no-stat, not bypass)" allowed merge -n HEAD
check "status"                        allowed status
check "-c other config key"           allowed -c core.pager=cat log -n 1

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
