#!/usr/bin/env bash
# Self-test for scripts/record-review.sh — reviewer allowlist, artifact-cites-HEAD binding,
# and the stamp gh-post.sh consumes.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/record-review.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

g() { git -C "$tmp/repo" -c user.email=t@t -c user.name=t "$@"; }
git init -q "$tmp/repo"
g commit -qm init --allow-empty
head="$(g rev-parse HEAD)"
gitdir="$(g rev-parse --absolute-git-dir)"

check() { # $1 name · $2 expected rc · args…
  local name="$1" want="$2"; shift 2
  (cd "$tmp/repo" && bash "$SCRIPT" "$@") >/dev/null 2>&1; local rc=$?
  if [ "$rc" -eq "$want" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s)\n' "$name" "$rc" "$want"; fi
}

printf 'Verdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/review.md"
: > "$tmp/repo/empty.md"
printf 'Verdict: MERGE\nCommit: 0123456789abcdef\n' > "$tmp/repo/stale.md"

check "session-family reviewer refused" 1 --reviewer fable-self --artifact review.md
check "empty artifact refused" 1 --reviewer gpt-5.6-luna --artifact empty.md
check "artifact citing a different sha refused" 1 --reviewer gpt-5.6-luna --artifact stale.md
check "missing args refused" 1 --reviewer gpt-5.6-luna

check "luna + artifact citing HEAD stamps" 0 --reviewer gpt-5.6-luna --artifact review.md
if grep -q "^$head gpt-5.6-luna" "$gitdir/independent-review-ok"; then
  pass=$((pass+1)); printf '  ok    stamp holds HEAD + reviewer\n'
else
  fail=$((fail+1)); printf '  FAIL  stamp content wrong: %s\n' "$(cat "$gitdir/independent-review-ok" 2>/dev/null)"
fi
check "glm accepted" 0 --reviewer zai/glm-5.3 --artifact review.md
check "terra refused — retired from the roster" 1 --reviewer gpt-5.6-terra --artifact review.md
check "opus fallback accepted" 0 --reviewer claude-opus-5 --artifact review.md

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
