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
g "$tmp/repo" commit -qm init --allow-empty
mkdir -p "$tmp/repo/docs"
cat > "$tmp/repo/docs/gh-denylist.txt" <<'EOF'
# test policy
secretword
missing (auth|rls)
EOF

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
check "--base staging-hotfix is NOT the carve-out" 1 no pr create --base staging-hotfix --title t --body "clean"
check "stray 'staging' arg without --base adjacency is NOT the carve-out" 1 no pr create --base dev --title staging --body "clean"
g "$tmp/repo" checkout -qb rogue
check "staging PR from a non-main branch still needs stamps" 1 no pr create --base staging --title t --body "clean"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
