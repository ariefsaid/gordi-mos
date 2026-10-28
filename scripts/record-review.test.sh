#!/usr/bin/env bash
# Self-test for scripts/record-review.sh — per-lens stamping (OD-WAY-83), reviewer allowlist,
# artifact structure validation (Reviewer/Verdict/HEAD), the DO-NOT-MERGE refusal, and the
# release/migration reviewer rules.
set -uo pipefail
unset MOS_ISSUE
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/record-review.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

g() { git -C "$tmp/repo" -c user.email=t@t -c user.name=t "$@"; }
git init -q "$tmp/repo"
g commit -qm init --allow-empty
g update-ref refs/remotes/origin/dev "$(g rev-parse HEAD)"
g commit -qm feature --allow-empty
head="$(g rev-parse HEAD)"
gitdir="$(g rev-parse --absolute-git-dir)"

check() { # $1 name · $2 expected rc · args…
  local name="$1" want="$2"; shift 2
  (cd "$tmp/repo" && bash "$SCRIPT" "$@") >/dev/null 2>&1; local rc=$?
  if [ "$rc" -eq "$want" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s)\n' "$name" "$rc" "$want"; fi
}

# One multi-lens artifact, three tagged sections — the shape /drive step 7 produces.
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\nnone\n\n## code-quality\nReviewer: zai/glm-5.3-flash (code-quality)\nVerdict: MERGE WITH CHANGES\nCommit: %s\nnone\n\n## security\nReviewer: claude-opus-5 (security)\nVerdict: MERGE\nCommit: %s\nnone\n' "$head" "$head" "$head" > "$tmp/repo/review.md"
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n\n## security\nReviewer: openai-codex/gpt-6-luna (security)\nVerdict: DO NOT MERGE\nCommit: %s\n' "$head" "$head" > "$tmp/repo/mixed.md"
printf '## security\nReviewer: openai-codex/gpt-6-luna (security)\nVerdict: MERGE\nVerdict: typo\nCommit: %s\n' "$head" > "$tmp/repo/malformed.md"
printf '## spec\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/noreviewer.md"
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nCommit: %s\nlooks fine to me\n' "$head" > "$tmp/repo/noverdict.md"
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: 0123456789abcdef\n' > "$tmp/repo/stale.md"
printf 'Reviewer: openai-codex/gpt-6-luna\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/untagged.md"

check "missing --lens refused" 1 --reviewer openai-codex/gpt-6-luna --artifact review.md
check "unknown lens refused" 1 --lens vibes --reviewer openai-codex/gpt-6-luna --artifact review.md
check "session-family reviewer refused" 1 --lens spec --reviewer fable-self --artifact review.md
check "terra refused — retired" 1 --lens spec --reviewer gpt-5.6-terra --artifact review.md
check "no Reviewer: line in the lens section refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact noreviewer.md
check "no Verdict: line in the lens section refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact noverdict.md
check "stale sha refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact stale.md
for length in 11 12; do
  printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "${head:0:$length}" > "$tmp/repo/short.md"
  check "$length-character HEAD refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact short.md
done
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/full.md"
check "full 40-character HEAD accepted" 0 --lens spec --reviewer openai-codex/gpt-6-luna --artifact full.md
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/my release"
check "artifact path containing whitespace refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact "$tmp/repo/my release"
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s0\n' "$head" > "$tmp/repo/extended.md"
check "HEAD embedded in a longer hash refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact extended.md
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: stale\n\n## security\nReviewer: openai-codex/gpt-6-luna (security)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/other-head.md"
check "another lens HEAD cannot certify this lens" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact other-head.md
check "untagged artifact refused — a stamp needs ITS lens's section" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact untagged.md
printf '## special\nReviewer: openai-codex/gpt-6-luna (specialist)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/substr.md"
check "substring collision refused ('## special'/'(specialist)' is not spec)" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact substr.md
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/lacking.md"
check "missing lens section refused (spec-only artifact, security requested)" 1 --lens security --reviewer openai-codex/gpt-6-luna --artifact lacking.md
check "another section's MERGE cannot stamp a DNM lens" 1 --lens security --reviewer openai-codex/gpt-6-luna --artifact mixed.md
check "duplicate verdict lines are refused" 1 --lens security --reviewer openai-codex/gpt-6-luna --artifact malformed.md
if [ ! -e "$gitdir/independent-review-security-ok" ]; then
  pass=$((pass+1)); printf '  ok    malformed verdicts do not create a security stamp\n'
else fail=$((fail+1)); printf '  FAIL  malformed verdicts created a security stamp\n'; fi
check "a DNM in another lens does not block this lens's MERGE" 0 --lens spec --reviewer openai-codex/gpt-6-luna --artifact mixed.md
check "--base dev is refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md --base dev
check "--base feature/topic is refused" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md --base feature/topic

check "reviewer not named by the section refused" 1 --lens spec --reviewer zai/glm-5.3-flash --artifact review.md
printf '## spec\nReviewer: openai-codex/gpt-6-luna-fake (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/spoof.md"
check "superstring reviewer name refused (exact match)" 1 --lens spec --reviewer openai-codex/gpt-6-luna --artifact spoof.md
check "spec lens stamps from its own section" 0 --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md
if grep -q "^$head spec openai-codex/gpt-6-luna" "$gitdir/independent-review-spec-ok"; then
  pass=$((pass+1)); printf '  ok    spec stamp holds HEAD + lens + reviewer\n'
else fail=$((fail+1)); printf '  FAIL  spec stamp wrong: %s\n' "$(cat "$gitdir/independent-review-spec-ok" 2>/dev/null)"; fi
check "code-quality lens stamps (glm)" 0 --lens code-quality --reviewer zai/glm-5.3-flash --artifact review.md
check "security lens stamps (opus fallback)" 0 --lens security --reviewer claude-opus-5 --artifact review.md
n="$(ls "$gitdir"/independent-review-*-ok 2>/dev/null | wc -l | tr -d ' ')"
if [ "$n" = "3" ]; then pass=$((pass+1)); printf '  ok    three separate lens stamps exist\n'
else fail=$((fail+1)); printf '  FAIL  expected 3 lens stamps, found %s\n' "$n"; fi

spec_stamp_before="$(cat "$gitdir/independent-review-spec-ok")"
quality_stamp_before="$(cat "$gitdir/independent-review-code-quality-ok")"
check "security DNM refuses and clears only its own stamp" 1 --lens security --reviewer openai-codex/gpt-6-luna --artifact mixed.md
if [ ! -e "$gitdir/independent-review-security-ok" ]; then
  pass=$((pass+1)); printf '  ok    security DNM clears the security stamp\n'
else fail=$((fail+1)); printf '  FAIL  security DNM left its passing stamp in place\n'; fi
if [ "$(cat "$gitdir/independent-review-spec-ok" 2>/dev/null)" = "$spec_stamp_before" ] \
  && [ "$(cat "$gitdir/independent-review-code-quality-ok" 2>/dev/null)" = "$quality_stamp_before" ]; then
  pass=$((pass+1)); printf '  ok    other exact-HEAD lens stamps remain unchanged after security DNM\n'
else fail=$((fail+1)); printf '  FAIL  security DNM changed another lens stamp\n'; fi

# Release candidates need Opus or Sol; migration branches accept Opus, Sol, or an exact-prefix Luna or Terra id.
git init -q "$tmp/rel-repo"
gr() { git -C "$tmp/rel-repo" -c user.email=t@t -c user.name=t "$@"; }
gr commit -qm init --allow-empty
gr update-ref refs/remotes/origin/dev "$(gr rev-parse HEAD)"
sec() {
  local reviewer="$1" head="$(gr rev-parse HEAD)"
  printf '## security\nReviewer: %s (security)\nVerdict: MERGE\nCommit: %s\n' "$reviewer" "$head" > "$tmp/rel-repo/review.md"
  shift
  (cd "$tmp/rel-repo" && bash "$SCRIPT" --lens security --reviewer "$reviewer" --artifact review.md "$@") >/dev/null 2>&1
}
relcheck() { # name · want rc · reviewer · optional record-review args…
  sec "$3" "${@:4}"; local rc=$?
  if [ "$rc" -eq "$2" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s)\n' "$1" "$rc" "$2"; fi
}
relcheck "HEAD contained in origin/dev is not a release candidate" 0 gpt-6-luna
relcheck "release candidate: opus security accepted" 0 claude-opus
gr commit -qm feature --allow-empty
relcheck "feature branch without migrations: luna security accepted" 0 gpt-6-luna
relcheck "feature branch without migrations: terra security accepted" 0 gpt-6.1-terra
mkdir -p "$tmp/rel-repo/supabase/migrations"; echo 'select 1;' > "$tmp/rel-repo/supabase/migrations/20261007000000_x.sql"
gr add -A && gr commit -qm migration
relcheck "migration branch: gpt-6-luna security accepted" 0 gpt-6-luna
relcheck "migration branch: openai-codex/gpt-6-luna security accepted" 0 openai-codex/gpt-6-luna-reviewer
relcheck "migration branch: luna security accepted" 0 luna-reviewer
relcheck "migration branch: opus security accepted" 0 claude-opus
relcheck "migration branch: gpt-6.1-terra security accepted" 0 gpt-6.1-terra
relcheck "spoofed id 'x-terra' refused on a migration branch" 1 x-gpt-6.1-terra
relcheck "spoofed id 'x-luna' refused on a migration branch" 1 x-luna
relcheck "spoofed id 'not-opus-luna' refused on a migration branch" 1 not-opus-luna
gr mv supabase/migrations/20261007000000_x.sql supabase/migrations/20261007000001_x.sql; gr commit -qm renamed
git -C "$tmp/rel-repo" update-ref refs/remotes/origin/dev HEAD~1
relcheck "renamed migration on a feature branch accepts Luna" 0 gpt-6-luna
gr checkout -q -b release/x HEAD; gr commit -q --allow-empty -m "fix on top"
git -C "$tmp/rel-repo" update-ref refs/remotes/origin/dev HEAD~1
relcheck "release candidate with a migration: gpt-6-luna refused" 1 gpt-6-luna
relcheck "release candidate: openai-codex/gpt-6.1-sol security accepted" 0 openai-codex/gpt-6.1-sol
relcheck "release candidate: fable security refused" 1 claude-fable-5-1
relcheck "release candidate: gpt-6.1-terra security refused" 1 gpt-6.1-terra

gr checkout -qb feature/explicit-main "$(gr rev-parse origin/dev)"
gr commit -q --allow-empty -m "ordinary work"
relcheck "explicit --base main marks a release candidate" 1 gpt-6-luna --base main
relcheck "explicit --base staging marks a release candidate" 1 gpt-6-luna --base staging
relcheck "release security stamp accepts Opus for --base main" 0 claude-opus-5 --base main
if [ "$(cat "$tmp/rel-repo/.git/independent-review-security-release-ok" 2>/dev/null)" = "$(gr rev-parse HEAD)" ]; then
  pass=$((pass+1)); printf '  ok    release-rule stamp contains the exact HEAD sha\n'
else fail=$((fail+1)); printf '  FAIL  release-rule stamp is missing the exact HEAD sha\n'; fi
relcheck "release security stamp accepts Opus for --base staging" 0 claude-opus-5 --base staging
if [ "$(cat "$tmp/rel-repo/.git/independent-review-security-release-ok" 2>/dev/null)" = "$(gr rev-parse HEAD)" ]; then
  pass=$((pass+1)); printf '  ok    staging release-rule stamp contains the exact HEAD sha\n'
else fail=$((fail+1)); printf '  FAIL  staging release-rule stamp is missing the exact HEAD sha\n'; fi
relcheck "ordinary security re-review on the same HEAD is accepted" 0 gpt-6-luna
if [ ! -e "$tmp/rel-repo/.git/independent-review-security-release-ok" ]; then
  pass=$((pass+1)); printf '  ok    ordinary security re-review clears prior release-rule stamp\n'
else fail=$((fail+1)); printf '  FAIL  ordinary security re-review left a release-rule stamp behind\n'; fi

gr checkout -qb feature/ordinary-dev "$(gr rev-parse origin/dev)"
gr commit -q --allow-empty -m "ordinary dev-bound work"
gr checkout -q --detach HEAD
relcheck "detached ordinary dev-bound commit is not a release candidate" 0 gpt-6-luna
gr update-ref refs/remotes/origin/main "$(gr rev-parse HEAD)"
relcheck "HEAD contained in origin/main is a release candidate" 1 gpt-6-luna

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
