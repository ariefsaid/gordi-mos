#!/usr/bin/env bash
# Self-test for scripts/gh-post.sh — the posting-policy scan, fail-closed policy file,
# and the two PR stamps. Proven able to fail: every refusal case asserts gh was NOT called.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/gh-post.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

# gh stub: records argv, exits 0.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$tmp/gh-calls"
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

check "clean comment passes through to gh" 0 yes issue comment 5 --body "all good here"
check "denylisted body refused, gh untouched" 1 no issue comment 5 --body "the secretword is out"
check "policy is case-insensitive ERE" 1 no issue comment 5 --body "Missing RLS on that table"

echo "contains secretword" > "$tmp/repo/body.md"
check "--body-file content scanned" 1 no issue comment 5 --body-file "$tmp/repo/body.md"
echo "clean file body" > "$tmp/repo/body.md"
check "clean --body-file passes" 0 yes issue comment 5 --body-file "$tmp/repo/body.md"

check "gh api -F field values scanned" 1 no api repos/x/y/issues -F body="has secretword inside"
check "api path naming another repo refused, gh untouched" 1 no api repos/other/elsewhere/issues -f title=x
check "api path naming this repo passes" 0 yes api repos/x/y/issues -f title=x
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
echo '{"body":"has secretword"}' > "$tmp/repo/payload.json"
check "gh api --input file scanned" 1 no api repos/x/y/issues --input "$tmp/repo/payload.json"
check "gh api --input - refused" 1 no api repos/x/y/issues --input -

mv "$tmp/repo/docs/gh-denylist.txt" "$tmp/repo/docs/gone.txt"
check "missing policy file = fail closed" 1 no issue comment 5 --body "anything"
mv "$tmp/repo/docs/gone.txt" "$tmp/repo/docs/gh-denylist.txt"

# ── PR stamps
head="$(g "$tmp/repo" rev-parse HEAD)"
gitdir="$(g "$tmp/repo" rev-parse --absolute-git-dir)"
check "pr create without stamps refused" 1 no pr create --title t --body "clean"
printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
check "pr create with verify stamp only refused" 1 no pr create --title t --body "clean"
printf '%s spec reviewer-x now art.md\n' "$head" > "$gitdir/independent-review-spec-ok"
printf '%s code-quality reviewer-x now art.md\n' "$head" > "$gitdir/independent-review-code-quality-ok"
check "two of three lens stamps refused (OD-WAY-83)" 1 no pr create --title t --body "clean"
printf '%s security reviewer-x now art.md\n' "$head" > "$gitdir/independent-review-security-ok"
check "verify + all three lens stamps passes" 0 yes pr create --title t --body "clean"
# The light stamp (pre-pr-verify.sh --dev) certifies a PR into dev only.
rm -f "$gitdir/pre-pr-verify-ok"; printf '%s' "$head" > "$gitdir/pre-pr-verify-dev-ok"
check "light stamp + lens stamps: --base dev passes" 0 yes pr create --base dev --title t --body "clean"
check "light stamp: equals-form --base=dev passes" 0 yes pr create --base=dev --title t --body "clean"
check "light stamp: --base main refused (needs the full stamp)" 1 no pr create --base main --title t --body "clean"
check "light stamp: no --base named refused" 1 no pr create --title t --body "clean"
check "light stamp: dev then main (last wins) refused" 1 no pr create --base dev --base main --title t --body "clean"
printf 'deadbeef' > "$gitdir/pre-pr-verify-dev-ok"
check "light stamp on the wrong sha refused even for dev" 1 no pr create --base dev --title t --body "clean"
rm -f "$gitdir/pre-pr-verify-dev-ok"; printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
check "full stamp still passes --base main" 0 yes pr create --base main --title t --body "clean"
check "full stamp also passes --base dev" 0 yes pr create --base dev --title t --body "clean"
check "global flags can't dodge the verb check" 1 no --repo other/repo pr create --title t --body "clean"
check "--head to another branch refused" 1 no pr create --head other-branch --title t --body "clean"
check "concatenated -Rother/repo refused" 1 no pr create -Rother/repo --title t --body "clean"
check "concatenated -Hother refused" 1 no pr create -Hother --title t --body "clean"
check "--hostname on pr create refused" 1 no pr create --hostname ghe.example --title t --body "clean"
check "alias 'pr new' refused (allowlist)" 1 no pr new --title t --body "clean"
echo "contains secretword" > "$tmp/repo/notes.md"
check "release create refused (allowlist)" 1 no release create v1 -F "$tmp/repo/notes.md"
check "gist create refused (allowlist)" 1 no gist create "$tmp/repo/notes.md"
printf 'deadbeef spec reviewer-x now art.md\n' > "$gitdir/independent-review-spec-ok"
check "one lens stamp on wrong sha refused" 1 no pr create --title t --body "clean"
g "$tmp/repo" checkout -q main 2>/dev/null || g "$tmp/repo" checkout -qb main
rm -f "$gitdir/pre-pr-verify-ok" "$gitdir"/independent-review-*-ok
check "main->staging promotion passes unstamped (release carve-out)" 0 yes pr create --base staging --title t --body "clean"
check "equals-form --base=staging promotion passes" 0 yes pr create --base=staging --title t --body "clean"
check "duplicate base flags: LAST wins — staging then dev refused" 1 no pr create --base staging --base dev --title t --body "clean"
check "duplicate base flags: dev then staging is the promotion" 0 yes pr create --base dev --base staging --title t --body "clean"
check "--base staging-hotfix is NOT the carve-out" 1 no pr create --base staging-hotfix --title t --body "clean"
check "stray 'staging' arg without --base adjacency is NOT the carve-out" 1 no pr create --base dev --title staging --body "clean"
g "$tmp/repo" checkout -qb rogue
check "staging PR from a non-main branch still needs stamps" 1 no pr create --base staging --title t --body "clean"

# ── REST PR create (api repos/<this>/pulls) passes the same four-stamp gate as pr create
g "$tmp/repo" checkout -qb feat-rest
rm -f "$gitdir/pre-pr-verify-ok" "$gitdir/pre-pr-verify-dev-ok" "$gitdir"/independent-review-*-ok
check "REST pr create without stamps refused" 1 no api repos/x/y/pulls -f title=t -f head=feat-rest -f base=dev
check "REST pr create, explicit --method POST, refused unstamped" 1 no api repos/x/y/pulls --method POST -f head=feat-rest -f base=dev
check "REST pr create, concatenated -XPOST, refused unstamped" 1 no api repos/x/y/pulls -XPOST -f head=feat-rest -f base=dev
check "REST pr create, leading and trailing slash, refused unstamped" 1 no api /repos/x/y/pulls/ -f head=feat-rest -f base=dev
check "REST pr create, query string, refused unstamped" 1 no api 'repos/x/y/pulls?x=1' -f head=feat-rest -f base=dev
check "api path with an empty segment refused" 1 no api repos/x/y//pulls -f head=feat-rest -f base=dev
check "api path with an encoded segment refused" 1 no api repos/x/y/pull%73 -f head=feat-rest -f base=dev
check "REST pulls list (explicit GET) passes unstamped" 0 yes api repos/x/y/pulls --method GET
check "REST merge (PUT pulls/N/merge) is not a create" 0 yes api repos/x/y/pulls/5/merge --method PUT -f merge_method=squash
head="$(g "$tmp/repo" rev-parse HEAD)"
printf '%s' "$head" > "$gitdir/pre-pr-verify-dev-ok"
for lens in spec code-quality security; do printf '%s %s reviewer-x now art.md\n' "$head" "$lens" > "$gitdir/independent-review-$lens-ok"; done
check "REST pr create, light stamp + lens stamps, base=dev passes" 0 yes api repos/x/y/pulls -f title=t -f head=feat-rest -f base=dev
check "REST pr create, concatenated -f fields pass" 0 yes api repos/x/y/pulls -fhead=feat-rest -fbase=dev
check "REST pr create, --raw-field= form passes" 0 yes api repos/x/y/pulls --raw-field=head=feat-rest --raw-field=base=dev
check "REST pr create, owner:branch head passes" 0 yes api repos/x/y/pulls -f head=x:feat-rest -f base=dev
check "REST pr create, light stamp, base=main refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=main
check "REST pr create, light stamp, no base refused" 1 no api repos/x/y/pulls -f head=feat-rest
check "REST pr create, base dev then main (last wins) refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev -f base=main
check "REST pr create, head naming another branch refused" 1 no api repos/x/y/pulls -f head=other -f base=dev
check "REST pr create, head naming another owner refused" 1 no api repos/x/y/pulls -f head=evil:feat-rest -f base=dev
check "REST pr create, no head refused" 1 no api repos/x/y/pulls -f base=dev
check "REST pr create, head_repo refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev -f head_repo=evil/y
echo '{"head":"feat-rest","base":"dev"}' > "$tmp/repo/pr.json"
check "REST pr create, --input payload refused" 1 no api repos/x/y/pulls --input "$tmp/repo/pr.json"
printf 'deadbeef security reviewer-x now art.md\n' > "$gitdir/independent-review-security-ok"
check "REST pr create, one lens on the wrong sha refused" 1 no api repos/x/y/pulls -f head=feat-rest -f base=dev

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
