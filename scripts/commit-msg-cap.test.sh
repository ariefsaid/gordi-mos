#!/usr/bin/env bash
# Self-test for .githooks/commit-msg — the 20-line essay cap (subject, comments and trailers free)
# and the refusal of a Claude co-author trailer.
set -uo pipefail
cd "$(dirname "$0")/.."
HOOK="$(pwd)/.githooks/commit-msg"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

check() { # $1 name · $2 expected rc · $3 msg content
  local name="$1" want="$2"
  printf '%s\n' "$3" > "$tmp/msg"
  bash "$HOOK" "$tmp/msg" >/dev/null 2>&1; local rc=$?
  if [ "$rc" -eq "$want" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s)\n' "$name" "$rc" "$want"; fi
}

check "subject-only passes" 0 "fix: one thing"
check "short body passes" 0 "fix: one thing

three lines
of body
here"
long="fix: essay
$(seq 1 25 | sed 's/^/body line /')"
check "21+ body lines refused" 1 "$long"
trailered="fix: ok
$(seq 1 19 | sed 's/^/l /')
Co-Authored-By: Pat Example <pat@example.com>
Signed-off-by: x <x@x>"
check "trailers don't count against the cap" 0 "$trailered"
commented="fix: ok
$(seq 1 30 | sed 's/^/# comment /')"
check "comment lines don't count" 0 "$commented"
generic="fix: ok
$(seq 1 15 | sed 's/^/l /')
Reviewed-by: someone <s@x>
Fixes: #123
Refs: OD-WAY-80
$(seq 1 4 | sed 's/^/m /')"
check "generic Token: trailers exempt" 0 "$generic"

check "Claude co-author trailer refused" 1 "fix: ok

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
check "lower-case Claude co-author trailer refused" 1 "fix: ok

co-authored-by: claude <x@y>"
check "a human co-author passes" 0 "fix: ok

Co-Authored-By: Pat Example <pat@example.com>"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
