#!/usr/bin/env bash
# Self-test for scripts/claim-check.sh. Every case proves the guard can FAIL, not just pass.
#
# FIXTURES ARE NEUTRAL ON PURPOSE. An earlier cut used the repo's own incident wording and date;
# the guard excludes this file from its diff arms, so that text was exempt by construction — the
# narrative was reconstructed inside the one file the guard cannot read. The arithmetic does not
# care which words or which date, so they are invented ones.
set -uo pipefail
GUARD="$(cd "$(dirname "$0")" && pwd)/claim-check.sh"
pass=0; fail=0
ok()  { printf '\033[32m  ✓ %s\033[0m\n' "$1"; pass=$((pass+1)); }
bad() { printf '\033[31m  ✗ %s\033[0m\n' "$1"; fail=$((fail+1)); }

setup() {
  TMP="$(mktemp -d)"; cd "$TMP"
  git init -q .; git config user.email t@t.test; git config user.name t
  git config commit.gpgsign false
  mkdir -p scripts; echo base > f.txt
  git add -A; git commit -qm 'base'
  BASE="$(git rev-parse HEAD)"
}
teardown() { cd /; rm -rf "$TMP"; }
run() { bash "$GUARD" "$@" >/dev/null 2>&1; echo $?; }
msg() { setup; printf '%s\n' "$1" > m.txt; R="$(run --message m.txt)"; teardown; echo "$R"; }

echo "claim-check self-test"

# ── incident narrative: SAME predicate for a message and a diff line ─────────────
# The count arm is gone; see scripts/claim-check.sh for why. What remains must be exercised in
# BOTH modes and in BOTH directions, because --branch is the only mode CI runs.
INC='the widget was published on 2024-01-01 by a bad add'
[ "$(msg "fix: $INC")" != 0 ] && ok "refused incident+date in a MESSAGE" || bad "ALLOWED incident+date in a message"
for d in '2024-01-01' '2024/01/01' 'Jan 1, 2024' '1 January 2024'; do
  [ "$(msg "fix: the widget was exposed on $d")" != 0 ] && ok "refused date form: $d" || bad "ALLOWED date form: $d"
done
setup; printf '# the widget was published on 2024-01-01\n' > note.md; git add -A
[ "$(run --staged)" != 0 ] && ok "refused incident+date in a STAGED line" || bad "ALLOWED incident+date staged"
teardown
setup; printf '# ruling 2024-01-01: the widget gets a bar stream\n' > note.md; git add -A
[ "$(run --staged)" = 0 ] && ok "allowed a ruling date with no cause beside it" || bad "refused a bare provenance date"
teardown
setup; printf '# never commit a file naming real people - this repo is public\n' > note.md; git add -A
[ "$(run --staged)" = 0 ] && ok "allowed the rule without its history" || bad "refused a forward-only rule"
teardown

# The DATE is half the predicate. Without this the guard could silently become a ban on ordinary
# engineering vocabulary — "exposed", "published", "leaked" all appear in honest prose — and no
# case would notice. Dropping the date requirement is a surviving mutant otherwise.
setup; printf '# the value is exposed via the native select element\n' > note.md; git add -A
[ "$(run --staged)" = 0 ] && ok "an incident WORD with no date passes" \
                          || bad "the guard became a word-ban — the date is half the predicate"
teardown

# A fixture clock is not "when it was learned". This exact line is the only false positive the
# incident arm had across the whole tracked tree, and it reddened a dev->main PR.
setup; printf "// '2026-07-01T03:14:00Z' fixture must never leak to the DOM\n" > note.md; git add -A
[ "$(run --staged)" = 0 ] && ok "an ISO timestamp is not an incident date" \
                          || bad "a fixture timestamp reddens the guard"
teardown

# ── the branch arm: ADDED LINES, and deliberately not commit messages ───────────
# CI runs only this mode, so both directions are pinned here. Judging merged commit messages would
# hard-red every dev->main PR on history nobody can rewrite — measured at 78 refusals over 248
# commits before this was scoped down.
setup
printf '# the widget was published on 2024-01-01\n' > note.md
git add -A; git commit -qm 'docs: note'
[ "$(run --branch "$BASE")" != 0 ] && ok "branch arm refuses an incident line in the diff" \
                                   || bad "branch arm MISSED an incident line in the diff"
teardown

setup; echo x >> f.txt; git commit -qam 'fix: the widget was published on 2024-01-01'
[ "$(run --branch "$BASE")" = 0 ] && ok "branch arm does NOT judge merged commit messages" \
                                  || bad "branch arm judges messages — every release PR goes red"
teardown

# ── the diff arm must refuse when git itself fails, not tick green over nothing ──
setup
printf '# the widget was published on 2024-01-01\n' > note.md; git add -A; git commit -qm 'docs'
git checkout -q --orphan unrelated; git rm -qrf . 2>/dev/null
echo z > z.txt; git add -A; git commit -qm 'unrelated root'
[ "$(run --branch "$BASE")" != 0 ] && ok "an unmergeable base refuses, does not report clean" \
                                   || bad "FAIL-OPEN: git diff failed and the arm reported clean"
teardown

# ── FAILS CLOSED — a check that cannot inspect must not report success ──────────
setup
[ "$(run --branch 'no-such-ref')" != 0 ] && ok "unresolvable base refuses" || bad "unresolvable base PASSED"
[ "$(run --branch '')" != 0 ]           && ok "empty base refuses"        || bad "empty base PASSED"
[ "$(run --message /nonexistent)" != 0 ] && ok "missing message file refuses" || bad "missing file PASSED"
teardown

# ── no eval: a ref must never execute, ON THE PATH THAT WAS VULNERABLE ─────────
# The attack is a LEGAL branch name. git check-ref-format permits $ ( ) ` and ; so the ref RESOLVES,
# gets past rev-parse, and reaches the git-diff builder — which is where the eval was. Passing an
# unresolvable payload only re-tests the rev-parse guard, which is what the first cut of these
# cases did: they stayed green against a re-introduced eval.
setup
P="$TMP/pwned"
# git rejects a SPACE in a ref, so the payload uses $IFS for it — this exact name is accepted by
# `git checkout -b`, which is what makes it the real attack and not a hypothetical one.
HOSTILE='feat/x$(touch$IFS'"$TMP"'/pwned)y'
git checkout -q -b "$HOSTILE" || bad "could not create the hostile branch — this case did not run"
git checkout -q -; echo y >> f.txt; git commit -qam 'second'
run --branch "$HOSTILE" >/dev/null
[ ! -f "$P" ] && ok "a RESOLVABLE hostile ref reaches the diff and does not execute" \
              || bad "COMMAND INJECTION via a legal branch name"
git checkout -q -b other 2>/dev/null; git branch -qD "$HOSTILE" 2>/dev/null
# and the unresolvable forms are refused before they get anywhere
run --branch "$BASE; touch $P; true" >/dev/null
[ ! -f "$P" ] && ok "an unresolvable payload is refused, not executed" || bad "COMMAND INJECTION via base"
teardown

# ── the exclusion list is load-bearing: prove it excludes those files and nothing else ─────────
setup
mkdir -p scripts
printf '# the widget was published on 2024-01-01\n' > scripts/claim-check.test.sh
git add -A
[ "$(run --staged)" = 0 ] && ok "the guard exempts its own tests" || bad "guard flagged its own test file"
printf '# the widget was published on 2024-01-01\n' > scripts/other-guard.sh
git add -A
[ "$(run --staged)" != 0 ] && ok "...and exempts nothing else" || bad "the exemption is too wide"
teardown

# ── the exclusion list is pinned: growing it must be a deliberate, visible edit ──
EXPECTED_EXCLUSIONS="scripts/claim-check.sh scripts/claim-check.test.sh scripts/pre-commit-hook.test.sh scripts/commit-msg-hook.test.sh"
ACTUAL="$(grep -oE "':\\(exclude\\)[^']+'" "$GUARD" | sed "s/':(exclude)//;s/'$//" | tr '\n' ' ' | sed 's/ $//')"
[ "$ACTUAL" = "$EXPECTED_EXCLUSIONS" ] \
  && ok "the exclusion list is exactly the three guard tests" \
  || bad "exclusion list changed: '$ACTUAL' (real narrative survives in an excluded file)"

# ── a -diff gitattribute must not empty the diff arm ────────────────────────────
setup
printf '*.md -diff\n' > .gitattributes
printf '# the widget was published on 2024-01-01\n' > note.md
git add -A
[ "$(run --staged)" != 0 ] && ok "a -diff gitattribute does not blind the guard" \
                           || bad "BYPASS: -diff gitattribute empties the diff arm"
teardown

# ── --message must not accept a directory ──────────────────────────────────────
setup; mkdir -p adir
[ "$(run --message adir)" != 0 ] && ok "--message refuses a directory" || bad "--message on a directory PASSED"
teardown

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
