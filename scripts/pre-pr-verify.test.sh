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

# The dependency self-heal. These cases RUN the script and watch what npm was asked to do.
# The first version of them grepped this script's own source text for the guard, which stayed
# green over an inverted condition (`if [ -x … ]`) that restored the bug completely — a check
# that could not come out red, in the file whose job is to notice that.
# Undo the planted red python test and ignore node_modules: without both, the script refuses on
# a red battery / a dirty worktree BEFORE it ever reaches the guard, and these cases would be
# measuring the refusal rather than the self-heal.
# Copy the pristine file: the red test was COMMITTED, so `git checkout --` would restore the
# red version and these cases would silently be measuring the refusal instead.
cp "$(pwd)/scripts/test_reporting_snapshot.py" "$tmp/repo/scripts/test_reporting_snapshot.py"
printf 'node_modules/\n' > "$tmp/repo/.gitignore"
git -C "$tmp/repo" add -A && git -C "$tmp/repo" commit -qm "restore python suite, ignore node_modules"
HEAD=$(git -C "$tmp/repo" rev-parse HEAD)

npm_log="$tmp/npm-argv.log"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s"\nexit 0\n' "$npm_log" > "$tmp/bin/npm"
chmod +x "$tmp/bin/npm"
installed() { grep -qx 'ci --no-audit --no-fund' "$npm_log"; }   # exact: --dry-run installs nothing
# A run that REFUSED (dirty worktree, red battery) also never installs, so "did not install" is
# only meaningful once we know the run got as far as the battery. Without this, an untracked
# file was enough to make the skip case pass for the wrong reason — it did, on the first try.
reached_battery() { grep -q '^run typecheck' "$npm_log"; }

# (a) no node_modules at all — the fresh-worktree case.
rm -rf "$tmp/repo/mos-app/node_modules"; : > "$npm_log"; rm -f "$STAMP"; run
if installed; then ok "installs when the worktree has no node_modules"
else bad "verify still dies on a fresh worktree instead of installing"; fi

# (b) dependencies present and current — installing again would cost minutes for nothing.
mkdir -p "$tmp/repo/mos-app/node_modules/.bin"
: > "$tmp/repo/mos-app/package-lock.json"
git -C "$tmp/repo" add -A && git -C "$tmp/repo" commit -qm "add a lockfile" >/dev/null
printf '#!/bin/sh\nexit 0\n' > "$tmp/repo/mos-app/node_modules/.bin/tsc"
chmod +x "$tmp/repo/mos-app/node_modules/.bin/tsc"
# Explicit timestamps, not two bare touches: both would land in the same second and `-nt` would
# be false either way, so the ordering these two cases turn on would not actually be established.
touch -t 202001010000 "$tmp/repo/mos-app/package-lock.json"
touch "$tmp/repo/mos-app/node_modules/.package-lock.json"   # written by npm ci; newer = current
: > "$npm_log"; rm -f "$STAMP"; run
if installed; then bad "re-installs when dependencies are already current"
elif ! reached_battery; then bad "the skip case never reached the battery — it refused instead"
else ok "skips the install when dependencies are current"; fi

# (c) dependencies present but STALE — the rebase-across-a-dependency-change case, which is the
# other half of what the guard's comment claims to cover and the half a tsc-existence test misses.
touch -t 202001010000 "$tmp/repo/mos-app/node_modules/.package-lock.json"   # tree now older
touch "$tmp/repo/mos-app/package-lock.json"                 # lockfile now newer than the tree
: > "$npm_log"; rm -f "$STAMP"; run
if installed; then ok "installs when node_modules is older than the lockfile"
else bad "a stale node_modules is stamped green over a tree CI would not build"; fi

# It must run BEFORE the first command that needs a binary from node_modules, or it heals nothing.
# Anchored on the first `npm run` line rather than on typecheck by name, so reordering the battery
# cannot leave this green while the install lands after the command that needed it.
guard_at=$(grep -n 'npm ci' "$SCRIPT" | head -1 | cut -d: -f1)
first_run=$(grep -n '^npm run ' "$SCRIPT" | head -1 | cut -d: -f1)
if [ -z "$guard_at" ] || [ -z "$first_run" ]; then
  bad "cannot locate the guard or the first npm run line (guard=${guard_at:-none} first=${first_run:-none})"
elif [ "$guard_at" -lt "$first_run" ]; then
  ok "the install runs before the first command that needs it"
else
  bad "the install runs too late to help"
fi

# Restore the plain stub for anything below.
printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/npm"; chmod +x "$tmp/bin/npm"
rm -rf "$tmp/repo/mos-app/node_modules"; rm -f "$STAMP"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
