#!/usr/bin/env bash
# Self-test for scripts/record-review.sh — per-lens stamping (OD-WAY-83), reviewer allowlist,
# artifact structure validation (Reviewer/Verdict/HEAD), and the DO-NOT-MERGE refusal.
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

# Design-pass rule checks use feature branches based on origin/dev, without release markers.
init_design_repo() { # $1 repo directory; commit any prepared base files and mark origin/dev
  mkdir -p "$1"
  git init -q "$1"
  git -C "$1" -c user.email=t@t -c user.name=t add -A
  git -C "$1" -c user.email=t@t -c user.name=t commit -qm base --allow-empty
  git -C "$1" update-ref refs/remotes/origin/dev "$(git -C "$1" rev-parse HEAD)"
}
commit_design_change() { # $1 repo · $2 message
  git -C "$1" -c user.email=t@t -c user.name=t add -A \
    && git -C "$1" -c user.email=t@t -c user.name=t commit -qm "$2"
}
check_design() { # $1 name · $2 expected rc · $3 repo · $4 expected diagnostic
  local name="$1" want="$2" repo="$3" diagnostic="$4" head output rc
  head="$(git -C "$repo" rev-parse HEAD)"
  printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$repo/review.md"
  output="$(cd "$repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md 2>&1)"
  rc=$?
  if [ "$rc" -eq "$want" ] && { [ -z "$diagnostic" ] || printf '%s\n' "$output" | grep -Fq "$diagnostic"; }; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s); %s\n' "$name" "$rc" "$want" "$(printf '%s' "$output" | tr '\n' ' ')"
  fi
}

owner_gh_bin="$tmp/owner-gh-bin"
mkdir -p "$owner_gh_bin"
cat > "$owner_gh_bin/gh" <<'EOF'
#!/usr/bin/env bash
[ "$1" = issue ] && [ "$2" = view ] && [ "$4" = --json ] || exit 2
if [ "$5" = body ] && [ -r "${FAKE_ISSUE_BODY_FILE:-}" ]; then
  cat "$FAKE_ISSUE_BODY_FILE"
  exit 0
fi
[ "$5" = labels ] || exit 2
if [ "${FAKE_GH_MODE:-}" = fail ]; then
  printf 'fake GitHub unavailable\n' >&2
  exit 1
fi
if [ "${FAKE_GH_MODE:-}" = owner ]; then
  printf '{"labels":[{"name":"owner-reported"}]}\n'
else
  printf '{"labels":[]}\n'
fi
EOF
chmod +x "$owner_gh_bin/gh"
init_owner_ui_repo() { # $1 repo · $2 branch · $3 commit subject
  local repo="$1" branch="$2" subject="$3"
  mkdir -p "$repo/mos-app/src/pages"
  printf 'export const Page = () => null;\n' > "$repo/mos-app/src/pages/page.tsx"
  init_design_repo "$repo"
  git -C "$repo" checkout -qb "$branch"
  printf 'export const Page = () => <main />;\n' > "$repo/mos-app/src/pages/page.tsx"
  commit_design_change "$repo" "$subject"
}
check_issue_skills() { # name · expected rc · artifact · body file · issue env · expected text
  local name="$1" want="$2" artifact="$3" body_file="$4" issue_env="$5" diagnostic="${6:-}" output rc
  output="$(cd "$tmp/repo" && PATH="$owner_gh_bin:$PATH" FAKE_ISSUE_BODY_FILE="$body_file" MOS_ISSUE="$issue_env" bash "$SCRIPT" --lens security --reviewer openai-codex/gpt-6-luna --artifact "$artifact" 2>&1)"
  rc=$?
  if [ "$rc" -eq "$want" ] && { [ -z "$diagnostic" ] || printf '%s\n' "$output" | grep -Fq "$diagnostic"; }; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s); %s\n' "$name" "$rc" "$want" "$(printf '%s' "$output" | tr '\n' ' ')"
  fi
}
check_owner_design() { # name · expected rc · repo · gh mode · expected text · optional second text
  local name="$1" want="$2" repo="$3" mode="$4" diagnostic="$5" second="${6:-}" head output rc
  head="$(git -C "$repo" rev-parse HEAD)"
  printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$repo/review.md"
  output="$(cd "$repo" && PATH="$owner_gh_bin:$PATH" FAKE_GH_MODE="$mode" bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md 2>&1)"
  rc=$?
  if [ "$rc" -eq "$want" ] && { [ -z "$diagnostic" ] || printf '%s\n' "$output" | grep -Fq "$diagnostic"; } \
    && { [ -z "$second" ] || printf '%s\n' "$output" | grep -Fq "$second"; }; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s); %s\n' "$name" "$rc" "$want" "$(printf '%s' "$output" | tr '\n' ' ')"
  fi
}

# Issue Skills plans require each evidence file under docs/ to be non-empty.
mkdir -p "$tmp/repo/docs/reviews/1541"
printf 'evidence\n' > "$tmp/repo/docs/reviews/1541/existing.md"
: > "$tmp/repo/docs/reviews/1541/empty.md"
printf 'outside evidence\n' > "$tmp/repo/outside.md"
ln -s "$tmp/repo/outside.md" "$tmp/repo/docs/reviews/1541/linked.md"
cat > "$tmp/repo/issue-plan.md" <<'EOF'
## Skills plan
| Skill | Phase | Evidence |
|---|---|---|
| tdd | build | docs/reviews/1541/existing.md |
EOF
printf 'Issue: #1541\n## security\nReviewer: openai-codex/gpt-6-luna (security)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/issue-review.md"
check_issue_skills 'Issue: #N plan accepts non-empty docs evidence' 0 issue-review.md "$tmp/repo/issue-plan.md" ''
printf 'No Skills plan here.\n' > "$tmp/repo/no-issue-plan.md"
check_issue_skills 'Issue without a Skills plan keeps existing review behavior' 0 issue-review.md "$tmp/repo/no-issue-plan.md" ''
printf '## security\nReviewer: openai-codex/gpt-6-luna (security)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/env-issue-review.md"
check_issue_skills 'MOS_ISSUE fetches the issue without an Issue artifact line' 0 env-issue-review.md "$tmp/repo/issue-plan.md" 1555
cat > "$tmp/repo/missing-issue-plan.md" <<'EOF'
## Skills plan
| Skill | Phase | Evidence |
|---|---|---|
| tdd | build | docs/reviews/1541/missing.md |
| tdd | build | docs/reviews/1541/empty.md |
| tdd | build | docs/reviews/1541/linked.md |
EOF
out="$(cd "$tmp/repo" && PATH="$owner_gh_bin:$PATH" FAKE_ISSUE_BODY_FILE="$tmp/repo/missing-issue-plan.md" bash "$SCRIPT" --lens security --reviewer openai-codex/gpt-6-luna --artifact issue-review.md 2>&1)"; rc=$?
if [ "$rc" -ne 0 ] \
  && printf '%s\n' "$out" | grep -Fq 'docs/reviews/1541/missing.md' \
  && printf '%s\n' "$out" | grep -Fq 'docs/reviews/1541/empty.md' \
  && printf '%s\n' "$out" | grep -Fq 'docs/reviews/1541/linked.md' \
  && printf '%s\n' "$out" | grep -Fq "evidence lives in the main checkout's docs/" \
  && printf '%s\n' "$out" | grep -Fq "write each file, or correct the plan's path"; then
  pass=$((pass+1)); printf '  ok    missing and empty issue evidence files are named with the fix\n'
else
  fail=$((fail+1)); printf '  FAIL  missing/empty evidence refusal — rc=%s; %s\n' "$rc" "$(printf '%s' "$out" | tr '\n' ' ')"
fi
owner_branch_repo="$tmp/owner-branch-ui-repo"
init_owner_ui_repo "$owner_branch_repo" 'fix/123-x' 'small owner-reported UI fix'
check_owner_design 'owner-reported UI issue on branch requires Skills evidence' 1 "$owner_branch_repo" owner 'fixes owner-reported issue #123'
check_owner_design 'unlabelled linked UI issue stamps without Skills evidence' 0 "$owner_branch_repo" unlabelled ''

owner_bare_repo="$tmp/owner-bare-branch-repo"
init_owner_ui_repo "$owner_bare_repo" 'fix/125' 'small owner-reported UI fix'
check_owner_design 'a branch named fix/<n> with no slug is linked' 1 "$owner_bare_repo" owner 'fixes owner-reported issue #125'

owner_css_repo="$tmp/owner-global-css-repo"
mkdir -p "$owner_css_repo/mos-app/src"; printf 'body{}\n' > "$owner_css_repo/mos-app/src/index.css"
init_design_repo "$owner_css_repo"; git -C "$owner_css_repo" checkout -qb fix/126-css
printf 'body{color:red}\n' > "$owner_css_repo/mos-app/src/index.css"; commit_design_change "$owner_css_repo" "global css fix"
check_owner_design 'an owner-reported fix touching only app-wide CSS requires Skills evidence' 1 "$owner_css_repo" owner 'fixes owner-reported issue #126'

owner_subject_repo="$tmp/owner-subject-ui-repo"
init_owner_ui_repo "$owner_subject_repo" 'feature/subject-reference' 'tweak page (#124)'
check_owner_design 'owner-reported issue referenced only in a commit subject requires Skills evidence' 1 "$owner_subject_repo" owner 'fixes owner-reported issue #124'

owner_unlinked_repo="$tmp/owner-unlinked-ui-repo"
init_owner_ui_repo "$owner_unlinked_repo" 'feature/no-linked-issue' 'small UI tweak'
check_owner_design 'UI diff with no linked issue stamps without Skills evidence' 0 "$owner_unlinked_repo" fail ''
check_owner_design 'unreadable linked issue labels refuse and name issue' 1 "$owner_branch_repo" fail 'issue #123' 'retry when GitHub is reachable'

owner_non_ui_repo="$tmp/owner-non-ui-repo"
mkdir -p "$owner_non_ui_repo"
printf 'base\n' > "$owner_non_ui_repo/README.md"
init_design_repo "$owner_non_ui_repo"
git -C "$owner_non_ui_repo" checkout -qb 'fix/125-non-ui'
printf 'changed\n' >> "$owner_non_ui_repo/README.md"
commit_design_change "$owner_non_ui_repo" 'non-UI owner-reported issue change'
check_owner_design 'owner-reported branch with non-UI diff stamps without Skills evidence' 0 "$owner_non_ui_repo" owner ''

small_repo="$tmp/small-ui-repo"
mkdir -p "$small_repo/mos-app/src/pages"
printf 'export const ExistingPage = () => null;\n' > "$small_repo/mos-app/src/pages/existing-page.tsx"
init_design_repo "$small_repo"
printf 'export const ExistingPage = () => <main />;\n' > "$small_repo/mos-app/src/pages/existing-page.tsx"
commit_design_change "$small_repo" 'small page tweak'
check_design 'small feature-branch UI tweak stamps without Skills evidence' 0 "$small_repo" ''

route_repo="$tmp/route-repo"
mkdir -p "$route_repo/mos-app/src"
printf 'export const routes = [];\n' > "$route_repo/mos-app/src/router.tsx"
init_design_repo "$route_repo"
printf "export const routes = [{ path: '/new' }];\n" > "$route_repo/mos-app/src/router.tsx"
commit_design_change "$route_repo" 'add route'
check_design 'added router path line requires a design pass' 1 "$route_repo" 'adds a route (mos-app/src/router.tsx)'

component_repo="$tmp/component-repo"
init_design_repo "$component_repo"
mkdir -p "$component_repo/mos-app/src/components"
printf 'export const NewCard = () => null;\n' > "$component_repo/mos-app/src/components/new-card.tsx"
commit_design_change "$component_repo" 'add component'
check_design 'new component requires a design pass' 1 "$component_repo" 'adds a component (mos-app/src/components/new-card.tsx)'

css_repo="$tmp/css-repo"
init_design_repo "$css_repo"
mkdir -p "$css_repo/mos-app/src/styles"
printf '.new-card { display: block; }\n' > "$css_repo/mos-app/src/styles/new-card.css"
commit_design_change "$css_repo" 'add stylesheet'
check_design 'new CSS file requires a design pass' 1 "$css_repo" 'adds a stylesheet (mos-app/src/styles/new-card.css)'

for t in pages/cafe-x-page.css.test.ts pages/cafe-x-page.test.ts components/x-card.test.tsx components/x-card.spec.tsx pages/__tests__/x.tsx; do
  test_repo="$tmp/test-only-$(printf '%s' "$t" | tr '/.' '--')"
  init_design_repo "$test_repo"
  mkdir -p "$test_repo/mos-app/src/$(dirname "$t")"
  printf 'export {};\n' > "$test_repo/mos-app/src/$t"
  commit_design_change "$test_repo" "add $t"
  check_design "a new test file ($t) needs no design pass" 0 "$test_repo" ''
done

threshold_repo="$tmp/150-ui-lines-repo"
mkdir -p "$threshold_repo/mos-app/src/components"
: > "$threshold_repo/mos-app/src/components/large.tsx"
init_design_repo "$threshold_repo"
for ((line=1; line<=150; line++)); do printf 'line %s\n' "$line"; done > "$threshold_repo/mos-app/src/components/large.tsx"
commit_design_change "$threshold_repo" '150-line component edit'
check_design '150 changed UI lines do not require a design pass' 0 "$threshold_repo" ''

large_repo="$tmp/large-ui-repo"
mkdir -p "$large_repo/mos-app/src/components"
: > "$large_repo/mos-app/src/components/large.tsx"
init_design_repo "$large_repo"
for ((line=1; line<=151; line++)); do printf 'line %s\n' "$line"; done > "$large_repo/mos-app/src/components/large.tsx"
commit_design_change "$large_repo" 'large component edit'
check_design '151 changed page/component UI lines require a design pass' 1 "$large_repo" 'changes 151 lines of page/component/shell UI'

test_lines_repo="$tmp/test-only-ui-lines-repo"
mkdir -p "$test_lines_repo/mos-app/src/components"
: > "$test_lines_repo/mos-app/src/components/large.test.tsx"
init_design_repo "$test_lines_repo"
for ((line=1; line<=200; line++)); do printf 'line %s\n' "$line"; done > "$test_lines_repo/mos-app/src/components/large.test.tsx"
commit_design_change "$test_lines_repo" 'large component test edit'
check_design 'large component test changes do not count toward the UI line threshold' 0 "$test_lines_repo" ''

shell_lines_repo="$tmp/large-shell-lines-repo"
mkdir -p "$shell_lines_repo/mos-app/src/shell"
: > "$shell_lines_repo/mos-app/src/shell/chrome.tsx"
init_design_repo "$shell_lines_repo"
for ((line=1; line<=151; line++)); do printf 'line %s\n' "$line"; done > "$shell_lines_repo/mos-app/src/shell/chrome.tsx"
commit_design_change "$shell_lines_repo" 'large shell edit'
check_design '151 changed shell UI lines require a design pass' 1 "$shell_lines_repo" 'changes 151 lines of page/component/shell UI'

release_repo="$tmp/release-ui-repo"
mkdir -p "$release_repo/mos-app/src/components"
printf 'export const Card = () => null;\n' > "$release_repo/mos-app/src/components/card.tsx"
init_design_repo "$release_repo"
printf 'export const Card = () => <div />;\n' > "$release_repo/mos-app/src/components/card.tsx"
commit_design_change "$release_repo" 'small release UI tweak'
git -C "$release_repo" update-ref refs/remotes/origin/main "$(git -C "$release_repo" rev-parse HEAD)"
check_design 'release candidate still requires a design pass' 1 "$release_repo" 'design pass required: release candidate'

deleted_page_repo="$tmp/deleted-page-repo"
mkdir -p "$deleted_page_repo/mos-app/src/pages"
printf 'export const RemovedPage = () => null;\n' > "$deleted_page_repo/mos-app/src/pages/removed-page.tsx"
init_design_repo "$deleted_page_repo"
git -C "$deleted_page_repo" rm -q mos-app/src/pages/removed-page.tsx \
  && git -C "$deleted_page_repo" -c user.email=t@t -c user.name=t commit -qm 'delete page'
check_design 'deleted page does not require a design pass' 0 "$deleted_page_repo" ''

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
    printf '\n## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$ui_head"
  } > "$tmp/ui-repo/$file"
}
check_ui() { # $1 name · $2 expected rc · $3 artifact · $4 expected diagnostic (optional)
  local name="$1" want="$2" artifact="$3" diagnostic="${4:-}"
  (cd "$tmp/ui-repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact "$artifact") > "$tmp/ui-output" 2>&1
  local rc=$?
  if [ "$rc" -eq "$want" ] && { [ -z "$diagnostic" ] || grep -Fq "$diagnostic" "$tmp/ui-output"; }; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s); %s\n' "$name" "$rc" "$want" "$(tr '\n' ' ' < "$tmp/ui-output")"
  fi
}
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$ui_head" > "$tmp/ui-repo/feature-no-skills.md"
check_ui 'new page requires Skills evidence on a feature branch' 1 feature-no-skills.md 'design pass required: adds a page (mos-app/src/pages/Page.tsx)'
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
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$non_ui_head" > "$tmp/non-ui-repo/review.md"
(cd "$tmp/non-ui-repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md) >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then pass=$((pass+1)); printf '  ok    non-UI diff does not require skills evidence\n'
else fail=$((fail+1)); printf '  FAIL  non-UI diff changed behavior — rc=%s\n' "$rc"; fi

# Test-only TSX files do not trigger a design pass.
mkdir -p "$tmp/scope-repo/mos-app/src/shell"
git init -q "$tmp/scope-repo"
gs() { git -C "$tmp/scope-repo" -c user.email=t@t -c user.name=t "$@"; }
gs commit -qm init --allow-empty
gs update-ref refs/remotes/origin/dev "$(gs rev-parse HEAD)"
printf 'export const T = () => null;\n' > "$tmp/scope-repo/mos-app/src/shell/tab.test.tsx"
gs add -A && gs commit -qm 'test only'
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$(gs rev-parse HEAD)" > "$tmp/scope-repo/review.md"
(cd "$tmp/scope-repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md) >/dev/null 2>&1
if [ $? -eq 0 ]; then pass=$((pass+1)); printf '  ok    unrelated test-only tsx does not require design-pass evidence\n'
else fail=$((fail+1)); printf '  FAIL  unrelated test-only tsx wrongly gated\n'; fi
mkdir -p "$tmp/scope-repo/mos-app/src/components"
printf 'export const Example = () => null;\n' > "$tmp/scope-repo/mos-app/src/components/example.test.tsx"
gs add -A && gs commit -qm 'component test only'
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$(gs rev-parse HEAD)" > "$tmp/scope-repo/review.md"
(cd "$tmp/scope-repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md) >/dev/null 2>&1
if [ $? -eq 0 ]; then pass=$((pass+1)); printf '  ok    component test-only tsx does not require design-pass evidence\n'
else fail=$((fail+1)); printf '  FAIL  component test-only tsx wrongly gated\n'; fi
printf 'export const B = () => null;\n' > "$tmp/scope-repo/mos-app/src/shell/bar.tsx"
gs add -A && gs commit -qm 'shell ui'
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$(gs rev-parse HEAD)" > "$tmp/scope-repo/review.md"
(cd "$tmp/scope-repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md) >/dev/null 2>&1
check_design 'new shell component requires a design pass' 1 "$tmp/scope-repo" 'adds a component (mos-app/src/shell/bar.tsx)'

# A deleted UI file does not trigger the gate.
mkdir -p "$tmp/del-repo/mos-app/src/components"
git init -q "$tmp/del-repo"
gd() { git -C "$tmp/del-repo" -c user.email=t@t -c user.name=t "$@"; }
printf 'export const A = () => null;\n' > "$tmp/del-repo/mos-app/src/components/a.tsx"
gd add -A && gd commit -qm init
gd update-ref refs/remotes/origin/dev "$(gd rev-parse HEAD)"
gd rm -q mos-app/src/components/a.tsx && gd commit -qm 'delete ui file'
printf '## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$(gd rev-parse HEAD)" > "$tmp/del-repo/review.md"
(cd "$tmp/del-repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md) >/dev/null 2>&1
if [ $? -eq 0 ]; then pass=$((pass+1)); printf '  ok    deleting a UI file does not require skills evidence\n'
else fail=$((fail+1)); printf '  FAIL  deleted UI file wrongly gated\n'; fi

# Release candidates need Opus; migration branches accept Opus or an exact-prefix Luna id.
git init -q "$tmp/rel-repo"
gr() { git -C "$tmp/rel-repo" -c user.email=t@t -c user.name=t "$@"; }
gr commit -qm init --allow-empty
gr update-ref refs/remotes/origin/dev "$(gr rev-parse HEAD)"
sec() {
  local reviewer="$1" head="$(gr rev-parse HEAD)"
  mkdir -p "$tmp/rel-repo/docs/reviews"
  printf 'Commit: %s\n' "$head" > "$tmp/rel-repo/docs/reviews/evidence.md"
  {
    printf '## Skills evidence\n| Playbook | Evidence file | Render evidence |\n|---|---|---|\n'
    for playbook in 'Impeccable shape' 'ui-ux-pro-max' 'Impeccable critique' 'Impeccable layout' 'Impeccable clarify' 'Impeccable harden' 'Impeccable polish' 'Taste'; do
      if [ "$playbook" = 'Impeccable critique' ]; then
        printf '| %s | reviews/evidence.md | Render: 390px, 768px, 1440px; real-length data used |\n' "$playbook"
      else
        printf '| %s | reviews/evidence.md | |\n' "$playbook"
      fi
    done
    printf '\n## security\nReviewer: %s (security)\nVerdict: MERGE\nCommit: %s\n' "$reviewer" "$head"
  } > "$tmp/rel-repo/review.md"
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
mkdir -p "$tmp/rel-repo/supabase/migrations"; echo 'select 1;' > "$tmp/rel-repo/supabase/migrations/20261007000000_x.sql"
gr add -A && gr commit -qm migration
relcheck "migration branch: gpt-6-luna security accepted" 0 gpt-6-luna
relcheck "migration branch: openai-codex/gpt-6-luna security accepted" 0 openai-codex/gpt-6-luna-reviewer
relcheck "migration branch: luna security accepted" 0 luna-reviewer
relcheck "migration branch: opus security accepted" 0 claude-opus
relcheck "spoofed id 'x-luna' refused on a migration branch" 1 x-luna
relcheck "spoofed id 'not-opus-luna' refused on a migration branch" 1 not-opus-luna
gr mv supabase/migrations/20261007000000_x.sql supabase/migrations/20261007000001_x.sql; gr commit -qm renamed
git -C "$tmp/rel-repo" update-ref refs/remotes/origin/dev HEAD~1
relcheck "renamed migration on a feature branch accepts Luna" 0 gpt-6-luna
gr checkout -q -b release/x HEAD; gr commit -q --allow-empty -m "fix on top"
git -C "$tmp/rel-repo" update-ref refs/remotes/origin/dev HEAD~1
relcheck "release candidate with a migration: gpt-6-luna refused" 1 gpt-6-luna

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

init_ancestor_evidence_repo() { # $1 repo; creates a qualifying UI change at the evidence commit
  local repo="$1"
  mkdir -p "$repo/mos-app/src/pages"
  init_design_repo "$repo"
  git -C "$repo" checkout -qb feature/evidence-ancestor
  printf 'export const Page = () => <main />;\n' > "$repo/mos-app/src/pages/Page.tsx"
  commit_design_change "$repo" 'add UI page'
}
write_ancestor_ui_review() { # $1 repo · $2 evidence commit · reviewer record cites current HEAD
  local repo="$1" evidence_commit="$2" head
  head="$(git -C "$repo" rev-parse HEAD)"
  mkdir -p "$repo/docs/reviews"
  printf 'Commit: %s\n' "$evidence_commit" > "$repo/docs/reviews/evidence.md"
  {
    printf '## Skills evidence\n| Playbook | Evidence file | Render evidence |\n|---|---|---|\n'
    for playbook in 'Impeccable shape' 'ui-ux-pro-max' 'Impeccable critique' 'Impeccable layout' 'Impeccable clarify' 'Impeccable harden' 'Impeccable polish' 'Taste'; do
      if [ "$playbook" = 'Impeccable critique' ]; then
        printf '| %s | reviews/evidence.md | Render: 390px, 768px, 1440px; real-length data used |\n' "$playbook"
      else
        printf '| %s | reviews/evidence.md | |\n' "$playbook"
      fi
    done
    printf '\n## spec\nReviewer: openai-codex/gpt-6-luna (spec)\nVerdict: MERGE\nCommit: %s\n' "$head"
  } > "$repo/review.md"
}
check_ancestor_ui() { # $1 name · $2 expected rc · $3 repo · $4 evidence commit
  local name="$1" want="$2" repo="$3" evidence_commit="$4" output rc
  write_ancestor_ui_review "$repo" "$evidence_commit"
  output="$(cd "$repo" && bash "$SCRIPT" --lens spec --reviewer openai-codex/gpt-6-luna --artifact review.md 2>&1)"
  rc=$?
  if [ "$rc" -eq "$want" ]; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s); %s\n' "$name" "$rc" "$want" "$(printf '%s' "$output" | tr '\n' ' ')"
  fi
}

ancestor_test_repo="$tmp/ui-ancestor-test-repo"
init_ancestor_evidence_repo "$ancestor_test_repo"
ancestor_evidence_head="$(git -C "$ancestor_test_repo" rev-parse HEAD)"
for test_file in mos-app/src/pages/Page.test.ts mos-app/src/pages/Extra.test.tsx mos-app/src/pages/Example.spec.ts mos-app/e2e/flow.ts supabase/tests/contract.sql; do
  mkdir -p "$ancestor_test_repo/$(dirname "$test_file")"
  printf 'test fixture\n' > "$ancestor_test_repo/$test_file"
done
commit_design_change "$ancestor_test_repo" 'add tests'
check_ancestor_ui 'test-only changes after Skills evidence accept the ancestor commit' 0 "$ancestor_test_repo" "$ancestor_evidence_head"
check_ancestor_ui 'an abbreviated evidence commit is refused' 1 "$ancestor_test_repo" "${ancestor_evidence_head:0:12}"

ancestor_css_repo="$tmp/ui-ancestor-css-repo"
init_ancestor_evidence_repo "$ancestor_css_repo"
ancestor_css_evidence_head="$(git -C "$ancestor_css_repo" rev-parse HEAD)"
printf 'body { color: red; }\n' > "$ancestor_css_repo/mos-app/src/pages/page.css"
commit_design_change "$ancestor_css_repo" 'change page styles'
check_ancestor_ui 'CSS changes after Skills evidence still require evidence for HEAD' 1 "$ancestor_css_repo" "$ancestor_css_evidence_head"

ancestor_source_repo="$tmp/ui-ancestor-source-repo"
init_ancestor_evidence_repo "$ancestor_source_repo"
ancestor_source_evidence_head="$(git -C "$ancestor_source_repo" rev-parse HEAD)"
printf 'export const value = 1;\n' > "$ancestor_source_repo/mos-app/src/value.ts"
commit_design_change "$ancestor_source_repo" 'change application source'
check_ancestor_ui 'non-test TypeScript changes still require evidence for HEAD' 1 "$ancestor_source_repo" "$ancestor_source_evidence_head"

ancestor_unrelated_repo="$tmp/ui-ancestor-unrelated-repo"
init_ancestor_evidence_repo "$ancestor_unrelated_repo"
ancestor_unrelated_evidence_head="$(git -C "$ancestor_unrelated_repo" rev-parse HEAD)"
unrelated_commit="$(git -C "$ancestor_unrelated_repo" -c user.email=t@t -c user.name=t commit-tree \
  "$(git -C "$ancestor_unrelated_repo" rev-parse HEAD^{tree})" -m unrelated)"
check_ancestor_ui 'a valid but non-ancestor evidence commit is refused' 1 "$ancestor_unrelated_repo" "$unrelated_commit"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
