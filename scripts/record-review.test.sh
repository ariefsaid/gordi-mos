#!/usr/bin/env bash
# Self-test for scripts/record-review.sh — per-lens stamping (OD-WAY-83), reviewer allowlist,
# artifact structure validation (Reviewer/Verdict/HEAD), and the DO-NOT-MERGE refusal.
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

# One multi-lens artifact, three tagged sections — the shape /drive step 7 produces.
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\nnone\n\n## code-quality\nReviewer: zai/glm-5.3-flash (code-quality)\nVerdict: MERGE WITH CHANGES\nCommit: %s\nnone\n\n## security\nReviewer: claude-opus-5 (security)\nVerdict: MERGE\nCommit: %s\nnone\n' "$head" "$head" "$head" > "$tmp/repo/review.md"
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n\n## security\nReviewer: gpt-5.6-luna (security)\nVerdict: DO NOT MERGE\nCommit: %s\n' "$head" "$head" > "$tmp/repo/mixed.md"
printf '## spec\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/noreviewer.md"
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nCommit: %s\nlooks fine to me\n' "$head" > "$tmp/repo/noverdict.md"
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: 0123456789abcdef\n' > "$tmp/repo/stale.md"
printf 'Reviewer: gpt-5.6-luna\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/untagged.md"

check "missing --lens refused" 1 --reviewer gpt-5.6-luna --artifact review.md
check "unknown lens refused" 1 --lens vibes --reviewer gpt-5.6-luna --artifact review.md
check "session-family reviewer refused" 1 --lens spec --reviewer fable-self --artifact review.md
check "terra refused — retired" 1 --lens spec --reviewer gpt-5.6-terra --artifact review.md
check "no Reviewer: line in the lens section refused" 1 --lens spec --reviewer gpt-5.6-luna --artifact noreviewer.md
check "no Verdict: line in the lens section refused" 1 --lens spec --reviewer gpt-5.6-luna --artifact noverdict.md
check "stale sha refused" 1 --lens spec --reviewer gpt-5.6-luna --artifact stale.md
check "untagged artifact refused — a stamp needs ITS lens's section" 1 --lens spec --reviewer gpt-5.6-luna --artifact untagged.md
printf '## special\nReviewer: gpt-5.6-luna (specialist)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/substr.md"
check "substring collision refused ('## special'/'(specialist)' is not spec)" 1 --lens spec --reviewer gpt-5.6-luna --artifact substr.md
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/lacking.md"
check "missing lens section refused (spec-only artifact, security requested)" 1 --lens security --reviewer gpt-5.6-luna --artifact lacking.md
check "another section's MERGE cannot stamp a DNM lens" 1 --lens security --reviewer gpt-5.6-luna --artifact mixed.md
check "DNM anywhere poisons even the MERGE section" 1 --lens spec --reviewer gpt-5.6-luna --artifact mixed.md

check "reviewer not named by the section refused" 1 --lens spec --reviewer zai/glm-5.3-flash --artifact review.md
printf '## spec\nReviewer: gpt-5.6-luna-fake (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/spoof.md"
check "superstring reviewer name refused (exact match)" 1 --lens spec --reviewer gpt-5.6-luna --artifact spoof.md
check "spec lens stamps from its own section" 0 --lens spec --reviewer gpt-5.6-luna --artifact review.md
if grep -q "^$head spec gpt-5.6-luna" "$gitdir/independent-review-spec-ok"; then
  pass=$((pass+1)); printf '  ok    spec stamp holds HEAD + lens + reviewer\n'
else fail=$((fail+1)); printf '  FAIL  spec stamp wrong: %s\n' "$(cat "$gitdir/independent-review-spec-ok" 2>/dev/null)"; fi
check "code-quality lens stamps (glm)" 0 --lens code-quality --reviewer zai/glm-5.3-flash --artifact review.md
check "security lens stamps (opus fallback)" 0 --lens security --reviewer claude-opus-5 --artifact review.md
n="$(ls "$gitdir"/independent-review-*-ok 2>/dev/null | wc -l | tr -d ' ')"
if [ "$n" = "3" ]; then pass=$((pass+1)); printf '  ok    three separate lens stamps exist\n'
else fail=$((fail+1)); printf '  FAIL  expected 3 lens stamps, found %s\n' "$n"; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
