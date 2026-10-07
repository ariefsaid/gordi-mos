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
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\nnone\n\n## code-quality\nReviewer: zai/glm-5.3-flash (code-quality)\nVerdict: MERGE WITH CHANGES\nCommit: %s\nnone\n\n## security\nReviewer: claude-opus-5 (security)\nVerdict: MERGE\nCommit: %s\nnone\n' "$head" "$head" "$head" > "$tmp/repo/review.md"
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n\n## security\nReviewer: gpt-5.6-luna (security)\nVerdict: DO NOT MERGE\nCommit: %s\n' "$head" "$head" > "$tmp/repo/mixed.md"
printf '## security\nReviewer: gpt-5.6-luna (security)\nVerdict: MERGE\nVerdict: typo\nCommit: %s\n' "$head" > "$tmp/repo/malformed.md"
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
for length in 11 12; do
  printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "${head:0:$length}" > "$tmp/repo/short.md"
  check "$length-character HEAD refused" 1 --lens spec --reviewer gpt-5.6-luna --artifact short.md
done
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/full.md"
check "full 40-character HEAD accepted" 0 --lens spec --reviewer gpt-5.6-luna --artifact full.md
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s0\n' "$head" > "$tmp/repo/extended.md"
check "HEAD embedded in a longer hash refused" 1 --lens spec --reviewer gpt-5.6-luna --artifact extended.md
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: stale\n\n## security\nReviewer: gpt-5.6-luna (security)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/other-head.md"
check "another lens HEAD cannot certify this lens" 1 --lens spec --reviewer gpt-5.6-luna --artifact other-head.md
check "untagged artifact refused — a stamp needs ITS lens's section" 1 --lens spec --reviewer gpt-5.6-luna --artifact untagged.md
printf '## special\nReviewer: gpt-5.6-luna (specialist)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/substr.md"
check "substring collision refused ('## special'/'(specialist)' is not spec)" 1 --lens spec --reviewer gpt-5.6-luna --artifact substr.md
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/lacking.md"
check "missing lens section refused (spec-only artifact, security requested)" 1 --lens security --reviewer gpt-5.6-luna --artifact lacking.md
check "another section's MERGE cannot stamp a DNM lens" 1 --lens security --reviewer gpt-5.6-luna --artifact mixed.md
check "duplicate verdict lines are refused" 1 --lens security --reviewer gpt-5.6-luna --artifact malformed.md
if [ ! -e "$gitdir/independent-review-security-ok" ]; then
  pass=$((pass+1)); printf '  ok    malformed verdicts do not create a security stamp\n'
else fail=$((fail+1)); printf '  FAIL  malformed verdicts created a security stamp\n'; fi
check "a DNM in another lens does not block this lens's MERGE" 0 --lens spec --reviewer gpt-5.6-luna --artifact mixed.md

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

spec_stamp_before="$(cat "$gitdir/independent-review-spec-ok")"
quality_stamp_before="$(cat "$gitdir/independent-review-code-quality-ok")"
check "security DNM refuses and clears only its own stamp" 1 --lens security --reviewer gpt-5.6-luna --artifact mixed.md
if [ ! -e "$gitdir/independent-review-security-ok" ]; then
  pass=$((pass+1)); printf '  ok    security DNM clears the security stamp\n'
else fail=$((fail+1)); printf '  FAIL  security DNM left its passing stamp in place\n'; fi
if [ "$(cat "$gitdir/independent-review-spec-ok" 2>/dev/null)" = "$spec_stamp_before" ] \
  && [ "$(cat "$gitdir/independent-review-code-quality-ok" 2>/dev/null)" = "$quality_stamp_before" ]; then
  pass=$((pass+1)); printf '  ok    other exact-HEAD lens stamps remain unchanged after security DNM\n'
else fail=$((fail+1)); printf '  FAIL  security DNM changed another lens stamp\n'; fi

# UI evidence gate: each playbook needs an existing HEAD-bound evidence file; renders need
# representative phone/tablet/desktop widths and real-length data.
mkdir -p "$tmp/ui-repo"
git init -q "$tmp/ui-repo"
gi() { git -C "$tmp/ui-repo" -c user.email=t@t -c user.name=t "$@"; }
gi commit -qm init --allow-empty
gi update-ref refs/remotes/origin/dev "$(gi rev-parse HEAD)"
mkdir -p "$tmp/ui-repo/mos-app/src/pages" "$tmp/ui-repo/docs/reviews"
printf 'export const Page = () => null;\n' > "$tmp/ui-repo/mos-app/src/pages/Page.tsx"
gi add mos-app/src/pages/Page.tsx && gi commit -qm 'add UI page'
ui_head="$(gi rev-parse HEAD)"
printf 'Commit: %s\n' "$ui_head" > "$tmp/ui-repo/docs/reviews/evidence.md"
write_ui_review() { # $1 artifact · $2 evidence path · $3 omitted row · $4 render line
  local file="$1" evidence="$2" omitted="$3" render="$4"
  {
    printf '## Skills evidence\n| Playbook | Evidence file | Render evidence |\n|---|---|---|\n'
    for playbook in 'Impeccable shape' 'ui-ux-pro-max' 'Impeccable critique' 'Impeccable layout' 'Impeccable clarify' 'Impeccable harden' 'Impeccable polish' 'Taste'; do
      [ "$playbook" = "$omitted" ] && continue
      if [ "$playbook" = 'Impeccable critique' ]; then
        printf '| %s | %s | %s |\n' "$playbook" "$evidence" "$render"
      else
        printf '| %s | %s | |\n' "$playbook" "$evidence"
      fi
    done
    printf '\n## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$ui_head"
  } > "$tmp/ui-repo/$file"
}
check_ui() { # $1 name · $2 expected rc · $3 artifact · $4 expected diagnostic (optional)
  local name="$1" want="$2" artifact="$3" diagnostic="${4:-}"
  (cd "$tmp/ui-repo" && bash "$SCRIPT" --lens spec --reviewer gpt-5.6-luna --artifact "$artifact") > "$tmp/ui-output" 2>&1
  local rc=$?
  if [ "$rc" -eq "$want" ] && { [ -z "$diagnostic" ] || grep -Fq "$diagnostic" "$tmp/ui-output"; }; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s); %s\n' "$name" "$rc" "$want" "$(tr '\n' ' ' < "$tmp/ui-output")"
  fi
}
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$ui_head" > "$tmp/ui-repo/feature-no-skills.md"
check_ui 'feature-branch UI diff stamps without Skills evidence' 0 feature-no-skills.md
gi update-ref refs/remotes/origin/main "$ui_head"
check_ui 'release-candidate UI diff still requires Skills evidence' 1 feature-no-skills.md "requires a '## Skills evidence' section"
write_ui_review missing-row.md reviews/evidence.md 'Taste' 'Render evidence: 390px, 768px, 1440px; real-length data used'
check_ui 'UI diff refuses missing playbook row' 1 missing-row.md 'Skills evidence is missing required row: Taste'
write_ui_review missing-shape.md reviews/evidence.md 'Impeccable shape' 'Render evidence: 390px, 768px, 1440px; real-length data used'
check_ui 'UI diff refuses missing Impeccable shape row' 1 missing-shape.md 'Skills evidence is missing required row: Impeccable shape'
write_ui_review missing-search.md reviews/evidence.md 'ui-ux-pro-max' 'Render evidence: 390px, 768px, 1440px; real-length data used'
check_ui 'UI diff refuses missing ui-ux-pro-max row' 1 missing-search.md 'Skills evidence is missing required row: ui-ux-pro-max'
write_ui_review missing-file.md reviews/not-there.md '' 'Render evidence: 390px, 768px, 1440px; real-length data used'
check_ui 'UI diff refuses nonexistent evidence file' 1 missing-file.md 'does not exist: reviews/not-there.md'
printf 'Commit: %s\n' '0000000000000000000000000000000000000000' > "$tmp/ui-repo/docs/reviews/evidence.md"
write_ui_review stale-evidence.md reviews/evidence.md '' 'Render evidence: 390px, 768px, 1440px; real-length data used'
check_ui 'UI diff refuses evidence without exact HEAD' 1 stale-evidence.md 'does not cite exact full 40-character HEAD'
printf 'Commit: %s\n' "$ui_head" > "$tmp/ui-repo/docs/reviews/evidence.md"
write_ui_review missing-width.md reviews/evidence.md '' 'Render evidence: 390px, 1440px; real-length data used'
check_ui 'UI diff refuses missing render width' 1 missing-width.md 'render evidence is missing width 768'
write_ui_review complete-ui.md reviews/evidence.md '' 'Render evidence: 390px, 768px, 1440px; real-length data used'
check_ui 'complete UI skills evidence accepted' 0 complete-ui.md

mkdir -p "$tmp/non-ui-repo"
git init -q "$tmp/non-ui-repo"
gn() { git -C "$tmp/non-ui-repo" -c user.email=t@t -c user.name=t "$@"; }
printf 'base\n' > "$tmp/non-ui-repo/README.md"
gn add README.md && gn commit -qm init
gn update-ref refs/remotes/origin/dev "$(gn rev-parse HEAD)"
printf 'changed\n' >> "$tmp/non-ui-repo/README.md"
gn add README.md && gn commit -qm 'non-UI change'
non_ui_head="$(gn rev-parse HEAD)"
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$non_ui_head" > "$tmp/non-ui-repo/review.md"
(cd "$tmp/non-ui-repo" && bash "$SCRIPT" --lens spec --reviewer gpt-5.6-luna --artifact review.md) >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then pass=$((pass+1)); printf '  ok    non-UI diff does not require skills evidence\n'
else fail=$((fail+1)); printf '  FAIL  non-UI diff changed behavior — rc=%s\n' "$rc"; fi

# Trigger scope: shell-level UI files gate; a test-only .tsx change does not.
mkdir -p "$tmp/scope-repo/mos-app/src/shell"
git init -q "$tmp/scope-repo"
gs() { git -C "$tmp/scope-repo" -c user.email=t@t -c user.name=t "$@"; }
gs commit -qm init --allow-empty
gs update-ref refs/remotes/origin/dev "$(gs rev-parse HEAD)"
printf 'export const T = () => null;\n' > "$tmp/scope-repo/mos-app/src/shell/tab.test.tsx"
gs add -A && gs commit -qm 'test only'
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$(gs rev-parse HEAD)" > "$tmp/scope-repo/review.md"
(cd "$tmp/scope-repo" && bash "$SCRIPT" --lens spec --reviewer gpt-5.6-luna --artifact review.md) >/dev/null 2>&1
if [ $? -eq 0 ]; then pass=$((pass+1)); printf '  ok    test-only tsx does not require skills evidence\n'
else fail=$((fail+1)); printf '  FAIL  test-only tsx wrongly gated\n'; fi
printf 'export const B = () => null;\n' > "$tmp/scope-repo/mos-app/src/shell/bar.tsx"
gs add -A && gs commit -qm 'shell ui'
gs update-ref refs/remotes/origin/main "$(gs rev-parse HEAD)"
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$(gs rev-parse HEAD)" > "$tmp/scope-repo/review.md"
(cd "$tmp/scope-repo" && bash "$SCRIPT" --lens spec --reviewer gpt-5.6-luna --artifact review.md) >/dev/null 2>&1
if [ $? -ne 0 ]; then pass=$((pass+1)); printf '  ok    shell tsx requires skills evidence\n'
else fail=$((fail+1)); printf '  FAIL  shell tsx bypassed the gate\n'; fi

# A deleted UI file does not trigger the gate.
mkdir -p "$tmp/del-repo/mos-app/src/components"
git init -q "$tmp/del-repo"
gd() { git -C "$tmp/del-repo" -c user.email=t@t -c user.name=t "$@"; }
printf 'export const A = () => null;\n' > "$tmp/del-repo/mos-app/src/components/a.tsx"
gd add -A && gd commit -qm init
gd update-ref refs/remotes/origin/dev "$(gd rev-parse HEAD)"
gd rm -q mos-app/src/components/a.tsx && gd commit -qm 'delete ui file'
printf '## spec\nReviewer: gpt-5.6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$(gd rev-parse HEAD)" > "$tmp/del-repo/review.md"
(cd "$tmp/del-repo" && bash "$SCRIPT" --lens spec --reviewer gpt-5.6-luna --artifact review.md) >/dev/null 2>&1
if [ $? -eq 0 ]; then pass=$((pass+1)); printf '  ok    deleting a UI file does not require skills evidence\n'
else fail=$((fail+1)); printf '  FAIL  deleted UI file wrongly gated\n'; fi

# Releases and migrations: the security lens needs an Opus reviewer.
git init -q "$tmp/rel-repo"
gr() { git -C "$tmp/rel-repo" -c user.email=t@t -c user.name=t "$@"; }
gr commit -qm init --allow-empty
gr update-ref refs/remotes/origin/dev "$(gr rev-parse HEAD)"
sec() { printf '## security\nReviewer: %s (security)\nVerdict: MERGE\nCommit: %s\n' "$1" "$(gr rev-parse HEAD)" > "$tmp/rel-repo/review.md"
  (cd "$tmp/rel-repo" && bash "$SCRIPT" --lens security --reviewer "$1" --artifact review.md) >/dev/null 2>&1; }
relcheck() { # name · want rc · reviewer
  sec "$3"; local rc=$?
  if [ "$rc" -eq "$2" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s)\n' "$1" "$rc" "$2"; fi
}
relcheck "release candidate (HEAD already in dev): luna security refused" 1 gpt-6-luna
relcheck "release candidate: opus security accepted" 0 claude-opus
gr commit -qm feature --allow-empty
relcheck "feature branch without migrations: luna security accepted" 0 gpt-6-luna
mkdir -p "$tmp/rel-repo/supabase/migrations"; echo 'select 1;' > "$tmp/rel-repo/supabase/migrations/20261007000000_x.sql"
gr add -A && gr commit -qm migration
relcheck "migration branch: luna security refused" 1 gpt-6-luna
relcheck "migration branch: opus security accepted" 0 claude-opus

relcheck "spoofed id 'not-opus-luna' refused on a migration branch" 1 not-opus-luna
gr mv supabase/migrations/20261007000000_x.sql supabase/migrations/20261007000001_x.sql; gr commit -qm renamed
git -C "$tmp/rel-repo" update-ref refs/remotes/origin/dev HEAD~1
relcheck "renamed/edited migration still needs opus" 1 gpt-6-luna
gr checkout -q -b release/x HEAD; gr commit -q --allow-empty -m "fix on top"
git -C "$tmp/rel-repo" update-ref refs/remotes/origin/dev HEAD~1
relcheck "release/* branch with a fix commit needs opus" 1 gpt-6-luna

gr checkout -q --detach HEAD; gr commit -q --allow-empty -m "detached work"
relcheck "detached HEAD outside dev/main needs opus" 1 gpt-6-luna

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
