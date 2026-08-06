#!/usr/bin/env bash
# Self-test for .githooks/pre-push — the stale-base refusal and every pass-through.
set -uo pipefail
cd "$(dirname "$0")/.."
HOOK="$(pwd)/.githooks/pre-push"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
NULLSHA=0000000000000000000000000000000000000000

check() { # $1 name · $2 expected rc · $3 stdin line · $4 repo dir
  local name="$1" want="$2" line="$3" repo="$4" rc
  (cd "$repo" && printf '%s\n' "$line" | bash "$HOOK") >/dev/null 2>&1; rc=$?
  if [ "$rc" -eq "$want" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — expected rc=%s, got rc=%s\n' "$name" "$want" "$rc"; fi
}

g() { git -C "$1" -c user.email=t@t -c user.name=t "${@:2}"; }

git init -q --bare "$tmp/origin.git"
git clone -q "$tmp/origin.git" "$tmp/repo"
g "$tmp/repo" checkout -qb dev
echo base > "$tmp/repo/f"; g "$tmp/repo" add f; g "$tmp/repo" commit -qm base
g "$tmp/repo" push -q origin dev

g "$tmp/repo" checkout -qb feat
echo feat > "$tmp/repo/feat"; g "$tmp/repo" add feat; g "$tmp/repo" commit -qm feat
FEAT_SHA=$(g "$tmp/repo" rev-parse HEAD)

check "branch rebased on origin/dev passes" 0 \
  "refs/heads/feat $FEAT_SHA refs/heads/feat $NULLSHA" "$tmp/repo"

# origin/dev moves ahead; feat is now stale.
git clone -q -b dev "$tmp/origin.git" "$tmp/other"
echo moved > "$tmp/other/g"; g "$tmp/other" add g; g "$tmp/other" commit -qm moved
g "$tmp/other" push -q origin HEAD:dev
g "$tmp/repo" fetch -q origin

check "branch behind moved origin/dev refuses" 1 \
  "refs/heads/feat $FEAT_SHA refs/heads/feat $NULLSHA" "$tmp/repo"
check "branch deletion (null sha) passes" 0 \
  "(delete) $NULLSHA refs/heads/feat $FEAT_SHA" "$tmp/repo"
check "pushing dev itself is exempt" 0 \
  "refs/heads/dev $FEAT_SHA refs/heads/dev $NULLSHA" "$tmp/repo"

git init -q "$tmp/loner"
g "$tmp/loner" commit -qm init --allow-empty
check "repo with no origin/dev passes" 0 \
  "refs/heads/x $(g "$tmp/loner" rev-parse HEAD) refs/heads/x $NULLSHA" "$tmp/loner"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
