#!/usr/bin/env bash
# Self-test for scripts/pre-pr-verify.sh — refusals, and that the stamp only exists
# after a fully green run, bound to the exact HEAD sha. npm is stubbed; the real
# battery's content is CI's concern, the STAMP CONTRACT is this guard's.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/pre-pr-verify.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

ok()   { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# Scratch repo shaped like this one: scripts/ + mos-app/, npm stubbed on PATH.
git init -q "$tmp/repo"
git -C "$tmp/repo" config user.email t@t && git -C "$tmp/repo" config user.name t
mkdir -p "$tmp/repo/scripts" "$tmp/repo/mos-app" "$tmp/bin"
# The whole scripts/ dir, not just the script under test: the battery now also runs the python
# side (scripts/reporting-snapshot.test.sh), and stubbing that away would make this self-test
# green over a step it never exercised.
cp -R "$(pwd)/scripts/." "$tmp/repo/scripts/"
echo x > "$tmp/repo/f"; git -C "$tmp/repo" add -A; git -C "$tmp/repo" commit -qm init
HEAD=$(git -C "$tmp/repo" rev-parse HEAD)
STAMP="$tmp/repo/.git/pre-pr-verify-ok"

printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/npm"; chmod +x "$tmp/bin/npm"
run() { (cd "$tmp/repo" && PATH="$tmp/bin:$PATH" bash scripts/pre-pr-verify.sh) >/dev/null 2>&1; }

echo dirty > "$tmp/repo/f"
if run; then bad "dirty worktree must refuse"; else ok "dirty worktree refuses"; fi
[ ! -f "$STAMP" ] && ok "no stamp after refusal" || bad "stamp written despite refusal"
git -C "$tmp/repo" checkout -q f

if run; then ok "green battery passes"; else bad "green battery must pass"; fi
if [ "$(cat "$STAMP" 2>/dev/null)" = "$HEAD" ]; then ok "stamp equals HEAD sha"; else bad "stamp missing or wrong sha"; fi

rm -f "$STAMP"
printf '#!/bin/sh\ncase "$*" in *test*) exit 1;; *) exit 0;; esac\n' > "$tmp/bin/npm"
if run; then bad "red battery must refuse"; else ok "red battery refuses"; fi
[ ! -f "$STAMP" ] && ok "no stamp after red battery" || bad "stamp written despite red battery"

# A red PYTHON suite must refuse too — the snapshot job's tests are part of the battery, and a
# battery that runs a step without propagating its failure is the same non-gate as not running it.
printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/npm"
rm -f "$STAMP"
cat >> "$tmp/repo/scripts/test_reporting_snapshot.py" <<'PY'


class DeliberatelyRedForTheSelfTest(unittest.TestCase):
    def test_this_must_sink_the_battery(self):
        self.fail("planted by scripts/pre-pr-verify.test.sh")
PY
git -C "$tmp/repo" add -A && git -C "$tmp/repo" commit -qm "plant a red python test"
if run; then bad "red python suite must refuse"; else ok "red python suite refuses"; fi
[ ! -f "$STAMP" ] && ok "no stamp after red python suite" || bad "stamp written despite red python suite"

# ── claim-check base resolution: BOTH branches ──────────────────────────────────
# The scratch repo has no remote, which is the SKIP branch every case above rides. The REFUSAL
# branch — a remote that exists whose base will not resolve — is the whole point of failing closed,
# and it was invisible here: mutating it into a silent skip left this file fully green.
#
# Back to green first: the case above appended a deliberately failing test, and a battery that is
# red for an unrelated reason would satisfy the refusal assertion for the wrong reason.
# Running the python suite leaves __pycache__. It must be removed BEFORE committing — an earlier
# `git add -A` here swept the .pyc files into the tree, and deleting them afterwards then read as a
# dirty worktree, which the battery refuses on. Targeted, not `git clean -fdx`: mos-app/ is an
# untracked empty directory the battery cds into and a broad clean deletes it.
drop_pyc() { find "$tmp/repo" -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null; }
clean_run() { drop_pyc; rm -f "$STAMP"; run; }

drop_pyc
cp "$(pwd)/scripts/test_reporting_snapshot.py" "$tmp/repo/scripts/test_reporting_snapshot.py"
git -C "$tmp/repo" add -A && git -C "$tmp/repo" commit -qm "restore the green battery"

clean_run; rc=$?
if [ "$rc" -eq 0 ] && [ -f "$STAMP" ]; then ok "battery is green again before the base-resolution cases"
else bad "battery still red (rc=$rc, stamp=$([ -f "$STAMP" ] && echo yes || echo no)) — the cases below would prove nothing"; fi
HEAD=$(git -C "$tmp/repo" rev-parse HEAD)
git -C "$tmp/repo" remote add origin "$tmp/repo" 2>/dev/null
clean_run
if [ ! -f "$STAMP" ]; then ok "remote present, base unresolvable: refuses and does not stamp"
else bad "remote present, base unresolvable: STAMPED — the fail-closed arm is a silent skip"; fi

# ...and with the base resolvable again it must go back to stamping, or the case above passes for
# the wrong reason (any breakage would satisfy it).
git -C "$tmp/repo" update-ref refs/remotes/origin/dev "$HEAD"
clean_run
if [ -f "$STAMP" ]; then ok "remote present, base resolvable: stamps again"
else bad "resolvable base did not stamp — the refusal case above proves nothing"; fi
git -C "$tmp/repo" remote remove origin 2>/dev/null

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
