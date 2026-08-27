#!/usr/bin/env bash
# Self-test for scripts/claim-check.sh. Every case proves the guard can FAIL, not just pass —
# an absence is not evidence until you know it could have come out otherwise.
set -uo pipefail
GUARD="$(cd "$(dirname "$0")" && pwd)/claim-check.sh"
pass=0; fail=0
ok()  { printf '\033[32m  ✓ %s\033[0m\n' "$1"; pass=$((pass+1)); }
bad() { printf '\033[31m  ✗ %s\033[0m\n' "$1"; fail=$((fail+1)); }

setup() {                       # a throwaway repo with one commit as the base
  TMP="$(mktemp -d)"; cd "$TMP"
  git init -q .; git config user.email t@t.test; git config user.name t
  git config commit.gpgsign false
  mkdir -p scripts; echo base > f.txt
  git add -A; git commit -qm 'base'
  BASE="$(git rev-parse HEAD)"
}
teardown() { cd /; rm -rf "$TMP"; }

run() { bash "$GUARD" "$@" >/dev/null 2>&1; echo $?; }

echo "claim-check self-test"

# ── test-count claims in commit messages ─────────────────────────────────────────
for msg in \
  'fix: 1271 unit tests pass' \
  'fix: Two published descriptions understate the catalog' \
  'fix: it holds 14 real addresses' \
  'fix: published three real addresses' \
  'fix: pgTAP 1186 tests PASS' \
  'fix: passed the WHOLE suite, 1184/1184' \
  'fix: 4680 passed across 407 files' \
  'fix: nine assertions in shared_11 carry the label'
do
  setup; printf '%s\n' "$msg" > m.txt
  [ "$(run --message m.txt)" != 0 ] && ok "refused: ${msg#fix: }" || bad "ALLOWED a count: ${msg#fix: }"
  teardown
done

setup; printf 'fix: the suite passes, red under both mutations\n' > m.txt
[ "$(run --message m.txt)" = 0 ] && ok "allowed a countless evidence claim" || bad "refused a clean message"
teardown

setup; printf 'fix(admin): close issue 494 and OD-WAY-79, migration 20260827000001\n' > m.txt
[ "$(run --message m.txt)" = 0 ] && ok "allowed ids/issue numbers (not evidence counts)" || bad "refused bare identifiers"
teardown

setup; printf '# a comment line: 99 tests pass\nfix: real subject\n' > m.txt
[ "$(run --message m.txt)" = 0 ] && ok "ignores git comment lines in the message file" || bad "flagged a # comment line"
teardown

# ── incident narrative in added lines ────────────────────────────────────────────
setup
printf '# these were published on 2026-08-27 by a bad add\n' > note.md; git add -A
[ "$(run --staged)" != 0 ] && ok "refused: staged 'published' + a date" || bad "ALLOWED incident narrative (staged)"
teardown

setup
printf '# the force-push of 2026-08-27 did not un-publish them\n' > note.md
git add -A; git commit -qm 'docs: note'
[ "$(run --branch "$BASE")" != 0 ] && ok "refused: branch diff 'force-push' + a date" || bad "ALLOWED incident narrative (branch)"
teardown

setup
printf '# owner ruling 2026-08-27: Cikal gets a bar stream\n' > note.md; git add -A
[ "$(run --staged)" = 0 ] && ok "allowed a ruling date with no cause beside it" || bad "refused innocuous provenance date"
teardown

setup
printf '# never commit a file that names real people - this repo is public\n' > note.md; git add -A
[ "$(run --staged)" = 0 ] && ok "allowed the rule stated without its history" || bad "refused a forward-only rule"
teardown

# ── the guard must not exempt itself by accident ─────────────────────────────────
setup; echo x >> f.txt; git commit -qam 'fix: nothing to see'
[ "$(run --branch "$BASE")" = 0 ] && ok "clean branch passes end to end" || bad "clean branch failed"
teardown

setup; printf 'fix: real work\n' > m.txt; echo x >> f.txt; git add -A
[ "$(run --message m.txt)" = 0 ] && [ "$(run --staged)" = 0 ] && ok "both modes green on a clean commit" || bad "clean commit failed a mode"
teardown

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
