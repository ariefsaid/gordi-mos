#!/usr/bin/env bash
# Self-test for scripts/gh-post.sh — the posting-policy scan, fail-closed policy file,
# and PR-stamp gates. Proven able to fail: every refusal case asserts gh was NOT called.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/gh-post.sh"
RECORD_SCRIPT="$(pwd)/scripts/record-review.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

# gh stub: records argv, exits 0.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<EOF
#!/usr/bin/env bash
if [ "\$1" = issue ] && [ "\$2" = view ]; then
  printf '%s\n' "\$*" >> "$tmp/gh-reads"
  cat "$tmp/issue-body"
else
  printf '%s\n' "\$*" >> "$tmp/gh-calls"
fi
EOF
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"

g() { git -C "$1" -c user.email=t@t -c user.name=t "${@:2}"; }
git init -q "$tmp/repo"
git -C "$tmp/repo" remote add origin https://github.com/x/y.git
g "$tmp/repo" commit -qm init --allow-empty
mkdir -p "$tmp/repo/docs"
cat > "$tmp/repo/docs/gh-denylist.txt" <<'EOF'
# test policy
secretword
missing (auth|rls)
EOF

envcheck() { # $1 name · $2 VAR=value · $3 expected rc · $4 expect-gh-called · args…
  local name="$1" kv="$2" want="$3" ghwant="$4"; shift 4
  rm -f "$tmp/gh-calls"
  (cd "$tmp/repo" && env "$kv" bash "$SCRIPT" "$@") >/dev/null 2>&1; local rc=$?
  local ghgot=no; [ -s "$tmp/gh-calls" ] && ghgot=yes
  if [ "$rc" -eq "$want" ] && [ "$ghgot" = "$ghwant" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s), gh-called=%s (want %s)\n' "$name" "$rc" "$want" "$ghgot" "$ghwant"; fi
}

check() { # $1 name · $2 expected rc · $3 expect-gh-called yes/no · args…
  local name="$1" want="$2" ghwant="$3"; shift 3
  rm -f "$tmp/gh-calls"
  (cd "$tmp/repo" && bash "$SCRIPT" "$@") >/dev/null 2>&1; local rc=$?
  local ghgot=no; [ -s "$tmp/gh-calls" ] && ghgot=yes
  if [ "$rc" -eq "$want" ] && [ "$ghgot" = "$ghwant" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s), gh-called=%s (want %s)\n' "$name" "$rc" "$want" "$ghgot" "$ghwant"; fi
}

check_message() { # $1 name · $2 expected rc · $3 expect-gh-called · $4 diagnostic · args…
  local name="$1" want="$2" ghwant="$3" diagnostic="$4"; shift 4
  rm -f "$tmp/gh-calls"
  local output rc ghgot=no
  output="$(cd "$tmp/repo" && bash "$SCRIPT" "$@" 2>&1)"; rc=$?
  [ -s "$tmp/gh-calls" ] && ghgot=yes
  if [ "$rc" -eq "$want" ] && [ "$ghgot" = "$ghwant" ] && grep -Fq "$diagnostic" <<< "$output"; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s), gh-called=%s (want %s), diagnostic=%s\n' "$name" "$rc" "$want" "$ghgot" "$ghwant" "$(printf '%s' "$output" | tr '\n' ' ')"
  fi
}

check "clean comment passes through to gh" 0 yes issue comment 5 --body "all good here"
check "denylisted body refused, gh untouched" 1 no issue comment 5 --body "the secretword is out"

ready_plan="$tmp/ready-plan.md"
cat > "$ready_plan" <<'EOF'
## Skills plan
| Skill | Phase | Evidence |
|---|---|---|
| tdd | build | docs/reviews/1541/tdd.md |
EOF
check_message "ready-for-agent issue create without a plan is refused" 1 no "ready-for-agent requires a valid Skills plan" issue create --title t --label ready-for-agent --body "No plan yet."
check_message "case-insensitive ready label on issue create requires a plan" 1 no "ready-for-agent requires a valid Skills plan" issue create --title t --label Ready-For-Agent --body "No plan yet."
check "ready-for-agent issue create with a plan passes" 0 yes issue create --title t --label bug,ready-for-agent --body-file "$ready_plan"
ready_plan_text="$(cat "$ready_plan")"
check "ready-for-agent issue create validates --body text" 0 yes issue create --title t --label ready-for-agent --body "$ready_plan_text"
check "ready-for-agent issue create validates -b text" 0 yes issue create --title t --label ready-for-agent -b "$ready_plan_text"
check "ready-for-agent issue create validates -F body file" 0 yes issue create --title t --label ready-for-agent -F "$ready_plan"
check_message "a plan in --assignee cannot satisfy the issue-body gate" 1 no "ready-for-agent requires a valid Skills plan" issue create --title t --label ready-for-agent --body "No plan yet." --assignee "$ready_plan_text"
check_message "a plan in --title cannot satisfy the issue-body gate" 1 no "ready-for-agent requires a valid Skills plan" issue edit 17 --add-label ready-for-agent --body "No plan yet." --title "$ready_plan_text"
check "issue create without ready-for-agent needs no plan" 0 yes issue create --title t --label needs-triage --body "No plan yet."
printf 'No plan yet.\n' > "$tmp/issue-body"
check_message "adding ready-for-agent fetches and rejects a current body without a plan" 1 no "issue #17" issue edit 17 --add-label ready-for-agent
check_message "case-insensitive ready label on issue edit requires a plan" 1 no "issue #17" issue edit 17 --add-label Ready-For-Agent
cat "$ready_plan" > "$tmp/issue-body"
check "adding ready-for-agent accepts the fetched current plan" 0 yes issue edit 17 --add-label ready-for-agent
printf 'No plan yet.\n' > "$tmp/issue-body"
check "other issue edits remain unaffected" 0 yes issue edit 17 --add-label needs-triage --body "No plan yet."
check "policy is case-insensitive ERE" 1 no issue comment 5 --body "Missing RLS on that table"

echo "contains secretword" > "$tmp/repo/body.md"
check "--body-file content scanned" 1 no issue comment 5 --body-file "$tmp/repo/body.md"
echo "clean file body" > "$tmp/repo/body.md"
check "clean --body-file passes" 0 yes issue comment 5 --body-file "$tmp/repo/body.md"
echo "contains secretword" > "$tmp/repo/short.md"
check "short -F body file scanned on issue verbs" 1 no issue comment 5 -F "$tmp/repo/short.md"
check "concatenated -Ffile scanned on pr verbs" 1 no pr comment 5 -F"$tmp/repo/short.md"
check "clean short -F body file passes" 0 yes issue comment 5 -F "$tmp/repo/body.md"

check "gh api -F field values scanned" 1 no api repos/x/y/issues -F body="has secretword inside"
check "api path naming another repo refused, gh untouched" 1 no api repos/other/elsewhere/issues -f title=x
check "API issue-comment write for this repo passes" 0 yes api repos/x/y/issues/17/comments -f body=comment
check "API issue creation through the issue collection is not allowlisted" 1 no api repos/x/y/issues -f title=x
check_message "REST issue-label POST is refused with the issue-edit route" 1 no "issue edit --add-label" api repos/x/y/issues/17/labels --method POST -f name=ready-for-agent
check_message "REST issue-label PATCH is refused with the issue-edit route" 1 no "issue edit --add-label" api repos/x/y/issues/17/labels -X PATCH -f name=ready-for-agent
check "REST issue-label GET remains allowed" 0 yes api repos/x/y/issues/17/labels --method GET
issue_label_message="labels go through 'issue create --label' or 'issue edit --add-label'"
check_message "REST issue PATCH with labels[]= is refused" 1 no "$issue_label_message" api repos/x/y/issues/17 -X PATCH -f 'labels[]=ready-for-agent'
check_message "REST issue PATCH with -F labels[] is refused" 1 no "$issue_label_message" api repos/x/y/issues/17 -X PATCH -F 'labels[]=ready-for-agent'
check_message "REST issue PATCH with --raw-field labels[] is refused" 1 no "$issue_label_message" api repos/x/y/issues/17 --method PATCH --raw-field 'labels[]=ready-for-agent'
printf '{"labels":["ready-for-agent"]}\n' > "$tmp/repo/labels.json"
check_message "REST issue PATCH with --input is refused" 1 no "$issue_label_message" api repos/x/y/issues/17 -X PATCH --input "$tmp/repo/labels.json"
check_message "REST issue POST with labels at collection is refused" 1 no "$issue_label_message" api repos/x/y/issues -X POST -f title=t -f 'labels[]=ready-for-agent'
check_message "REST issue PATCH through leading-slash path is refused" 1 no "$issue_label_message" api /repos/x/y/issues/17 -X PATCH -f 'labels[]=ready-for-agent'
check "REST issue PATCH state=closed remains allowed" 0 yes api repos/x/y/issues/17 -X PATCH -f state=closed
check "api path with no repo (e.g. /user) refused" 1 no api user
check "--repo naming another repo refused on issue verbs" 1 no issue comment 5 --repo other/elsewhere --body "fine"
check "--repo naming this repo passes on issue verbs" 0 yes issue comment 5 --repo x/y --body "fine"
check "api path with dot segments refused" 1 no api repos/x/y/issues/../../other/repo/issues -f title=x
check "api --hostname refused" 1 no api --hostname evil.example repos/x/y/issues -f title=x
envcheck "GH_REPO in the environment is refused" GH_REPO=other/elsewhere 1 no issue comment 5 --body "fine"
envcheck "GH_HOST in the environment is refused" GH_HOST=evil.example 1 no issue comment 5 --body "fine"

check "stdin body-file ('-') refused — unscannable" 1 no issue comment 5 --body-file -
echo "contains secretword" > "$tmp/repo/eq.md"
check "equals-form --body-file=… scanned" 1 no issue comment 5 --body-file="$tmp/repo/eq.md"
check "equals-form --input=… scanned" 1 no api repos/x/y/issues --input="$tmp/repo/eq.md"
check "concatenated -Fbody=@file scanned" 1 no api repos/x/y/issues -Fbody=@"$tmp/repo/eq.md"
check "equals-form --field=body=@file scanned" 1 no api repos/x/y/issues --field=body=@"$tmp/repo/eq.md"
echo '{"body":"has secretword"}' > "$tmp/repo/payload.json"
check "gh api --input file scanned" 1 no api repos/x/y/issues --input "$tmp/repo/payload.json"
check "gh api --input - refused" 1 no api repos/x/y/issues --input -

mv "$tmp/repo/docs/gh-denylist.txt" "$tmp/repo/docs/gone.txt"
check "missing policy file = fail closed" 1 no issue comment 5 --body "anything"
mv "$tmp/repo/docs/gone.txt" "$tmp/repo/docs/gh-denylist.txt"

# ── PR stamps
head="$(g "$tmp/repo" rev-parse HEAD)"
gitdir="$(g "$tmp/repo" rev-parse --absolute-git-dir)"
check "pr create without stamps refused" 1 no pr create --title t --body "Reused: x"
printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
check "pr create with verify stamp only refused" 1 no pr create --title t --body "Reused: x"
printf '%s spec reviewer-x now art.md\n' "$head" > "$gitdir/independent-review-spec-ok"
printf '%s code-quality reviewer-x now art.md\n' "$head" > "$gitdir/independent-review-code-quality-ok"
check "two of three lens stamps refused (OD-WAY-83)" 1 no pr create --title t --body "Reused: x"
printf '%s security reviewer-x now art.md\n' "$head" > "$gitdir/independent-review-security-ok"
check "verify + all three lens stamps passes" 0 yes pr create --title t --body "Reused: x"
# PRs into dev rely on CI verify and need no local verify stamp; all other bases need the full stamp.
rm -f "$gitdir/pre-pr-verify-ok" "$gitdir/pre-pr-verify-dev-ok"
check "pr create without a Reused: line refused" 1 no pr create --base dev --title t --body "no reuse note"
printf 'Summary\n\n**Reused:** the existing table\n' > "$tmp/reused-body.md"
printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
printf '%s security reviewer-x now art.md release\n' "$head" > "$gitdir/independent-review-security-ok"
check "a PR into main needs no Reused: line (release)" 0 yes pr create --base main --title t --body "release package"
rm -f "$gitdir/pre-pr-verify-ok"
check "a **Reused:** line in a body file passes" 0 yes pr create --base dev --title t --body-file "$tmp/reused-body.md"
check "lens stamps without any verify stamp: --base dev passes" 0 yes pr create --base dev --title t --body "Reused: x"
check "lens stamps without any verify stamp: equals-form --base=dev passes" 0 yes pr create --base=dev --title t --body "Reused: x"
check "-B dev is recognized as the base and passes without full verify" 0 yes pr create -B dev --title t --body "Reused: x"
check_message "base-like title value cannot impersonate the dev base" 1 no "no full verify stamp" pr create --title -Bdev --body clean
check_message "-Bmain is recognized as a non-dev base" 1 no "no full verify stamp" pr create -Bmain --title t --body "Reused: x"
check_message "conflicting --base and -B values refuse with name-one-base guidance" 1 no "name one base" pr create --base dev -B main --title t --body "Reused: x"
check_message "concatenated -Bmain conflicts with a dev base" 1 no "name one base" pr create --base dev -Bmain --title t --body "Reused: x"
check_message "a grouped short flag carrying B refuses" 1 no "grouped" pr create --base dev -dBmain --title t --body "Reused: x"
check_message "a grouped short flag ending in B refuses" 1 no "grouped" pr create --base dev -dB main --title t --body "Reused: x"
check "main PR without the full verify stamp refuses" 1 no pr create --base main --title t --body "Reused: x"
printf '%s' "$head" > "$gitdir/pre-pr-verify-dev-ok"
check "main PR with only the --dev verify stamp refuses" 1 no pr create --base main --title t --body "Reused: x"
check "--dev verify stamp is not needed for --base dev" 0 yes pr create --base dev --title t --body "Reused: x"
check "light stamp: no --base named refused" 1 no pr create --title t --body "Reused: x"
check_message "conflicting --base values refuse rather than using the last value" 1 no "name one base" pr create --base dev --base main --title t --body "Reused: x"
rm -f "$gitdir/pre-pr-verify-dev-ok"; printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
check "full stamp still passes --base main" 0 yes pr create --base main --title t --body "Reused: x"
check "full stamp also passes --base dev" 0 yes pr create --base dev --title t --body "Reused: x"

# A dev-tip security record made without a release base must not authorize a main/staging PR.
g "$tmp/repo" update-ref refs/remotes/origin/dev "$head"
printf '## security\nReviewer: gpt-6-luna (security)\nVerdict: MERGE\nCommit: %s\n' "$head" > "$tmp/repo/dev-security-review.md"
(cd "$tmp/repo" && bash "$RECORD_SCRIPT" --lens security --reviewer gpt-6-luna --artifact dev-security-review.md) >/dev/null 2>&1
record_rc=$?
if [ "$record_rc" -eq 0 ] && ! grep -q ' release$' "$gitdir/independent-review-security-ok"; then
  pass=$((pass+1)); printf '  ok    dev-tip security stamp has no release token without --base\n'
else fail=$((fail+1)); printf '  FAIL  dev-tip security stamp unexpectedly carries release (rc=%s)\n' "$record_rc"; fi
check "dev PR remains allowed with an ordinary security stamp" 0 yes pr create --base dev --title t --body "Reused: x"
release_message="a PR into main needs release-rule stamps — record the security lens with: bash scripts/record-review.sh --lens security --base main --reviewer <opus id> --artifact <record>"
check_message "dev-tip security stamp without release token refuses a main PR" 1 no "$release_message" pr create --base main --title t --body "Reused: x"
g "$tmp/repo" checkout -qb feature/staging-release-gate
check_message "dev-tip security stamp without release token refuses a staging PR" 1 no "a PR into staging needs release-rule stamps" pr create --base staging --title t --body "Reused: x"

mkdir -p "$tmp/repo/docs/reviews"
printf 'Commit: %s\n' "$head" > "$tmp/repo/docs/reviews/release-evidence.md"
{
  printf '## Skills evidence\n| Playbook | Evidence file | Render evidence |\n|---|---|---|\n'
  for playbook in 'Impeccable shape' 'ui-ux-pro-max' 'Impeccable critique' 'Impeccable layout' 'Impeccable clarify' 'Impeccable harden' 'Impeccable polish' 'Taste'; do
    if [ "$playbook" = 'Impeccable critique' ]; then
      printf '| %s | reviews/release-evidence.md | Render: 390px, 768px, 1440px; real-length data used |\n' "$playbook"
    else
      printf '| %s | reviews/release-evidence.md | |\n' "$playbook"
    fi
  done
  printf '\n## security\nReviewer: claude-opus-5 (security)\nVerdict: MERGE\nCommit: %s\n' "$head"
} > "$tmp/repo/release-security-review.md"
(cd "$tmp/repo" && bash "$RECORD_SCRIPT" --lens security --base main --reviewer claude-opus-5 --artifact release-security-review.md) >/dev/null 2>&1
record_rc=$?
if [ "$record_rc" -eq 0 ] && grep -Eq "^$head security claude-opus-5 .* release$" "$gitdir/independent-review-security-ok"; then
  pass=$((pass+1)); printf '  ok    Opus security stamp with --base main carries the release token\n'
else fail=$((fail+1)); printf '  FAIL  Opus security stamp with --base main did not carry release (rc=%s)\n' "$record_rc"; fi
check "a PR into main passes with a release-rule security stamp" 0 yes pr create --base main --title t --body "release package"
check "a PR into staging passes with a release-rule security stamp" 0 yes pr create --base staging --title t --body "release package"
check "global flags can't dodge the verb check" 1 no --repo other/repo pr create --title t --body "Reused: x"
check "--head to another branch refused" 1 no pr create --head other-branch --title t --body "Reused: x"
check "concatenated -Rother/repo refused" 1 no pr create -Rother/repo --title t --body "Reused: x"
check "concatenated -Hother refused" 1 no pr create -Hother --title t --body "Reused: x"
check "--hostname on pr create refused" 1 no pr create --hostname ghe.example --title t --body "Reused: x"
check "alias 'pr new' refused (allowlist)" 1 no pr new --title t --body "clean"
echo "contains secretword" > "$tmp/repo/notes.md"
check "release create refused (allowlist)" 1 no release create v1 -F "$tmp/repo/notes.md"
check "gist create refused (allowlist)" 1 no gist create "$tmp/repo/notes.md"
printf 'deadbeef spec reviewer-x now art.md\n' > "$gitdir/independent-review-spec-ok"
check "one lens stamp on wrong sha refused" 1 no pr create --title t --body "Reused: x"
g "$tmp/repo" checkout -q main 2>/dev/null || g "$tmp/repo" checkout -qb main
rm -f "$gitdir/pre-pr-verify-ok" "$gitdir"/independent-review-*-ok
check "main->staging promotion passes unstamped (release carve-out)" 0 yes pr create --base staging --title t --body "Reused: x"
check "equals-form --base=staging promotion passes" 0 yes pr create --base=staging --title t --body "Reused: x"
check_message "conflicting bases staging and dev are refused" 1 no "name one base" pr create --base staging --base dev --title t --body "Reused: x"
check_message "conflicting bases dev and staging are refused" 1 no "name one base" pr create --base dev --base staging --title t --body "Reused: x"
check "--base staging-hotfix is NOT the carve-out" 1 no pr create --base staging-hotfix --title t --body "Reused: x"
check "stray 'staging' arg without --base adjacency is NOT the carve-out" 1 no pr create --base dev --title staging --body "Reused: x"
g "$tmp/repo" checkout -qb rogue
check "staging PR from a non-main branch still needs stamps" 1 no pr create --base staging --title t --body "Reused: x"

# ── REST PR create (api repos/<this>/pulls) passes the same four-stamp gate as pr create
g "$tmp/repo" checkout -qb feat-rest
rm -f "$gitdir/pre-pr-verify-ok" "$gitdir/pre-pr-verify-dev-ok" "$gitdir"/independent-review-*-ok
check "REST pr create without stamps refused" 1 no api repos/x/y/pulls -f title=t -f head=feat-rest -f base=dev -f body="Reused: x"
check "REST pr create, explicit --method POST, refused unstamped" 1 no api repos/x/y/pulls --method POST -f head=feat-rest -f base=dev
check "REST pr create, concatenated -XPOST, refused unstamped" 1 no api repos/x/y/pulls -XPOST -f head=feat-rest -f base=dev
check "REST pr create, leading and trailing slash, refused unstamped" 1 no api /repos/x/y/pulls/ -f head=feat-rest -f base=dev
check "REST pr create, query string, refused unstamped" 1 no api 'repos/x/y/pulls?x=1' -f head=feat-rest -f base=dev
check "api path with an empty segment refused" 1 no api repos/x/y//pulls -f head=feat-rest -f base=dev
check "api path with an encoded segment refused" 1 no api repos/x/y/pull%73 -f head=feat-rest -f base=dev
check "REST pulls list (explicit GET) passes unstamped" 0 yes api repos/x/y/pulls --method GET
check "REST pulls list, concatenated -XGET, passes unstamped" 0 yes api repos/x/y/pulls -XGET
check "REST pulls list, --method=get, passes unstamped" 0 yes api repos/x/y/pulls --method=get
check "decoy flag value before the endpoint refused" 1 no api -p repos/x/y/issues/1 repos/x/y/pulls -f head=feat-rest -f base=dev
check "flags before the endpoint refused" 1 no api -X POST repos/x/y/pulls -f head=feat-rest -f base=dev
check "global flag before api refused" 1 no --repo x/y api repos/x/y/pulls -f head=feat-rest -f base=dev
check "URL fragment in the path refused" 1 no api 'repos/x/y/pulls#x' -f head=feat-rest -f base=dev
check "short-flag cluster hiding -X refused" 1 no api repos/x/y/pulls --method GET -iXPOST -f head=feat-rest -f base=dev
check "short-flag cluster hiding -F refused" 1 no api repos/x/y/issues -iFbody=@"$tmp/repo/eq.md"
check "stray positional after the endpoint refused" 1 no api repos/x/y/issues extra -f title=x
check "end-of-flags marker refused" 1 no api repos/x/y/issues -- -f title=x
check "value-taking flag at the end refused" 1 no api repos/x/y/issues -f
api_allowlist="Allowed API writes: POST repos/x/y/security-advisories; POST repos/x/y/pulls (REST PR stamps required); POST repos/x/y/issues/<number>/comments; PATCH repos/x/y/issues/<number> without labels."
check_message "contents PUT is refused with the API write allowlist" 1 no "$api_allowlist" api repos/x/y/contents/README.md -X PUT -f message=edit
check "contents DELETE is refused" 1 no api repos/x/y/contents/README.md -X DELETE -f message=delete
check "merge-upstream is refused" 1 no api repos/x/y/merge-upstream -X POST -f branch=main
check "branch rename is refused" 1 no api repos/x/y/branches/dev/rename -X PATCH -f new_name=main
check "REST merge (PUT pulls/N/merge) refuses — merges go through gh pr merge" 1 no api repos/x/y/pulls/5/merge --method PUT -f merge_method=squash
check "REST branch merge (POST merges) refuses" 1 no api repos/x/y/merges --method POST -f base=main -f head=dev
check "REST ref update refuses" 1 no api repos/x/y/git/refs/heads/main --method POST -f ref=refs/heads/main -f sha=abc
check "REST branch rename variant is refused" 1 no api repos/x/y/branches/x/rename --method PATCH -f new_name=y
check "security advisory creation is allowlisted" 0 yes api repos/x/y/security-advisories --method POST -f summary=report
check "issue comment creation is allowlisted" 0 yes api repos/x/y/issues/17/comments -f body=comment
check "issue PATCH without labels is allowlisted" 0 yes api repos/x/y/issues/17 --method PATCH -f state=closed
check "contents GET remains allowed" 0 yes api /repos/x/y/contents/README.md --method get
check "contents GET with no method or fields remains allowed" 0 yes api repos/x/y/contents/README.md
check "contents GET with input and no fields remains implied GET" 0 yes api repos/x/y/contents/README.md --input "$tmp/repo/body.md"
head="$(g "$tmp/repo" rev-parse HEAD)"
for lens in spec code-quality security; do printf '%s %s reviewer-x now art.md\n' "$head" "$lens" > "$gitdir/independent-review-$lens-ok"; done
check_message "REST pr create without a Reused: body refused (stamped)" 1 no "Reused:" api repos/x/y/pulls -f title=t -f head=feat-rest -f base=dev -f body=plain
check "REST pr create, lens stamps without verify stamp, base=dev passes" 0 yes api repos/x/y/pulls -f title=t -f head=feat-rest -f base=dev -f body="Reused: x"
check "REST pr create with explicit POST passes the same stamp gate" 0 yes api repos/x/y/pulls --method POST -f head=feat-rest -f base=dev -f body="Reused: x"
check "REST pr create, concatenated -f fields pass" 0 yes api repos/x/y/pulls -fhead=feat-rest -fbase=dev "-fbody=Reused: x"
check "REST pr create, --raw-field= form passes" 0 yes api repos/x/y/pulls --raw-field=head=feat-rest --raw-field=base=dev "--raw-field=body=Reused: x"
check "REST pr create, owner:branch head passes" 0 yes api repos/x/y/pulls -f head=x:feat-rest -f base=dev -f body="Reused: x"
check "REST main PR without full verify stamp refuses" 1 no api repos/x/y/pulls -f head=feat-rest -f base=main
printf '%s' "$head" > "$gitdir/pre-pr-verify-dev-ok"
check "REST main PR with only --dev verify stamp refuses" 1 no api repos/x/y/pulls -f head=feat-rest -f base=main
rm -f "$gitdir/pre-pr-verify-dev-ok"; printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
check_message "REST main PR without a release security token refuses" 1 no "a PR into main needs release-rule stamps" api repos/x/y/pulls -f head=feat-rest -f base=main
check_message "REST staging PR without a release security token refuses" 1 no "a PR into staging needs release-rule stamps" api repos/x/y/pulls -f head=feat-rest -f base=staging
printf '%s security claude-opus-5 now art.md release\n' "$head" > "$gitdir/independent-review-security-ok"
check "REST main PR passes with a release security token" 0 yes api repos/x/y/pulls -f head=feat-rest -f base=main
check "REST staging PR passes with a release security token" 0 yes api repos/x/y/pulls -f head=feat-rest -f base=staging
rm -f "$gitdir/pre-pr-verify-ok"; printf '%s' "$head" > "$gitdir/pre-pr-verify-dev-ok"
check "REST pr create, cluster -ifbase=main after base=dev refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev -ifbase=main
check "REST pr create, -F head=@file refused" 1 no api repos/x/y/pulls -F head=@"$tmp/repo/body.md" -f base=dev
check "REST pr create, light stamp, no base refused" 1 no api repos/x/y/pulls -f head=feat-rest
check "REST pr create, base dev then main (last wins) refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev -f base=main
check "REST pr create, head naming another branch refused" 1 no api repos/x/y/pulls -f head=other -f base=dev
check "REST pr create, head naming another owner refused" 1 no api repos/x/y/pulls -f head=evil:feat-rest -f base=dev
check "REST pr create, no head refused" 1 no api repos/x/y/pulls -f base=dev
check "REST pr create, head_repo refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev -f head_repo=evil/y
echo '{"head":"feat-rest","base":"dev"}' > "$tmp/repo/pr.json"
check "REST pr create, --input payload refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev --input "$tmp/repo/pr.json"
printf 'deadbeef security reviewer-x now art.md\n' > "$gitdir/independent-review-security-ok"
check "REST pr create, one lens on the wrong sha refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
