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
# __pycache__ too: the battery runs the python suite, which writes a .pyc on every run. Committed
# once by `git add -A`, it then re-dirties the worktree and the script refuses — which reads as
# "skipped the install" unless reached_battery() is watching.
printf 'node_modules/\n__pycache__/\n' > "$tmp/repo/.gitignore"
rm -rf "$tmp/repo/scripts/__pycache__"
git -C "$tmp/repo" add -A && git -C "$tmp/repo" commit -qm "restore python suite, ignore node_modules"
HEAD=$(git -C "$tmp/repo" rev-parse HEAD)

npm_log="$tmp/npm-argv.log"
# The stub MODELS npm rather than saying yes to everything. `ci` creates node_modules/.bin/tsc and
# stamps .package-lock.json, exactly as a real install does; every `run` that needs a binary from
# node_modules dies 127 without it. That is what makes ORDERING observable: a guard placed after
# `npm run typecheck` cannot heal it, so case (a) goes red. The previous version exited 0
# unconditionally, so moving the guard below typecheck — the bug fully restored — scored 12/12.
cat > "$tmp/bin/npm" <<STUB
#!/bin/sh
printf '%s\n' "\$*" >> "$npm_log"
case "\$1" in
  ci)
    mkdir -p node_modules/.bin
    for b in tsc eslint stylelint vitest vite; do
      printf '#!/bin/sh\nexit 0\n' > "node_modules/.bin/\$b"; chmod +x "node_modules/.bin/\$b"
    done
    : > node_modules/.package-lock.json
    exit 0 ;;
  run)
    # The battery reaches for a DIFFERENT binary per script: typecheck/build need tsc, lint needs
    # eslint and stylelint, test:coverage needs vitest. Modelling only tsc restated the guard's own
    # assumption, so a tsc-present/eslint-missing tree was unhealed AND invisible here — the guard
    # and its model agreeing with each other is not evidence about a database of binaries.
    case "\$2" in
      typecheck|build) need=tsc ;;
      lint)            need=eslint ;;
      test:coverage)   need=vitest ;;
      *)               need=tsc ;;
    esac
    if [ ! -x "node_modules/.bin/\$need" ]; then
      echo "sh: \$need: command not found" >&2
      exit 127
    fi
    exit 0 ;;
esac
exit 0
STUB
chmod +x "$tmp/bin/npm"
installed()       { grep -qx 'ci --no-audit --no-fund' "$npm_log"; }   # exact: --dry-run installs nothing
# A run that REFUSED (dirty worktree, red battery) also never installs, so "did not install" is
# only meaningful once we know the run got as far as the battery.
reached_battery() { grep -q '^run typecheck' "$npm_log"; }

# The lockfile must be TRACKED before any of this: an untracked file makes the scratch worktree
# dirty and the script refuses, which is indistinguishable from "skipped the install" unless
# reached_battery() is watching. It caught exactly that while this was being written.
: > "$tmp/repo/mos-app/package-lock.json"
git -C "$tmp/repo" add -A && git -C "$tmp/repo" commit -qm "add a lockfile" >/dev/null
HEAD=$(git -C "$tmp/repo" rev-parse HEAD)

# (a) no node_modules at all — the fresh-worktree case, and the ordering case: the stub's
#     typecheck dies 127 unless the install genuinely preceded it.
rm -rf "$tmp/repo/mos-app/node_modules"; : > "$npm_log"; rm -f "$STAMP"; run
if installed && [ -f "$STAMP" ]; then ok "installs on a fresh worktree, BEFORE the first command that needs it"
else bad "verify still dies on a fresh worktree instead of installing (stamp=$([ -f "$STAMP" ] && echo yes || echo no))"; fi

# (b) dependencies present and current — installing again would cost minutes for nothing.
# A CURRENT tree carries every binary the battery reaches for, not just the sentinel — planting
# one by hand would model a half-installed tree and call it healthy.
mkdir -p "$tmp/repo/mos-app/node_modules/.bin"
for b in tsc eslint stylelint vitest vite; do
  printf '#!/bin/sh\nexit 0\n' > "$tmp/repo/mos-app/node_modules/.bin/$b"
  chmod +x "$tmp/repo/mos-app/node_modules/.bin/$b"
done
# Explicit timestamps, not two bare touches: both would land in the same second and `-nt` would be
# false either way, so the ordering these two cases turn on would not actually be established.
touch -t 202001010000 "$tmp/repo/mos-app/package-lock.json"
touch "$tmp/repo/mos-app/node_modules/.package-lock.json"   # written by npm ci; newer = current
: > "$npm_log"; rm -f "$STAMP"; run
if installed; then bad "re-installs when dependencies are already current"
elif ! reached_battery; then bad "the skip case never reached the battery — it refused instead"
else ok "skips the install when dependencies are current"; fi

# (c) present but STALE — the rebase-across-a-dependency-change case.
touch -t 202001010000 "$tmp/repo/mos-app/node_modules/.package-lock.json"
touch "$tmp/repo/mos-app/package-lock.json"
: > "$npm_log"; rm -f "$STAMP"; run
if installed; then ok "installs when node_modules is older than the lockfile"
else bad "a stale node_modules is stamped green over a tree CI would not build"; fi

# (d) HALF-INSTALLED — node_modules exists and is current by date, but the binary is gone. This is
#     the state the body claims the guard handles and the pre-commit hook does not; without this
#     case, weakening the guard to `[ ! -d node_modules ]` scored 12/12.
rm -f "$tmp/repo/mos-app/node_modules/.bin/tsc"
touch -t 202001010000 "$tmp/repo/mos-app/package-lock.json"
touch "$tmp/repo/mos-app/node_modules/.package-lock.json"
: > "$npm_log"; rm -f "$STAMP"; run
if installed; then ok "installs when node_modules exists but its binaries do not"
else bad "a half-installed node_modules is not healed — the guard is only testing the directory"; fi

# (d2) HALF-INSTALLED, the OTHER half — tsc present, eslint gone, dates current. Without this the
#      guard could probe a single sentinel and the whole suite stayed 14/14 while `npm run lint`
#      died 127 mid-battery on a tree the guard called healthy.
rm -f "$tmp/repo/mos-app/node_modules/.bin/eslint"
touch -t 202001010000 "$tmp/repo/mos-app/package-lock.json"
touch "$tmp/repo/mos-app/node_modules/.package-lock.json"
: > "$npm_log"; rm -f "$STAMP"; run
if installed && [ -f "$STAMP" ]; then ok "installs when a binary OTHER than tsc is missing"
else bad "a tsc-present/eslint-missing tree is unhealed — the guard probes one sentinel (stamp=$([ -f "$STAMP" ] && echo yes || echo no))"; fi

# (e) the install ITSELF fails. The body claims the self-heal cannot mask a red; that path was the
#     one the harness never exercised, in a file whose whole point is that a green must have been
#     able to be red.
cat > "$tmp/bin/npm" <<STUB
#!/bin/sh
printf '%s\n' "\$*" >> "$npm_log"
case "\$1" in ci) echo "npm ERR! lockfile out of sync" >&2; exit 1 ;; esac
exit 0
STUB
chmod +x "$tmp/bin/npm"
rm -rf "$tmp/repo/mos-app/node_modules"; : > "$npm_log"; rm -f "$STAMP"
if run; then bad "a failing npm ci must sink the battery"; else ok "a failing npm ci refuses"; fi
[ ! -f "$STAMP" ] && ok "no stamp after a failing install" || bad "stamp written despite a failing install"

# Restore the plain stub for anything below.
printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/npm"; chmod +x "$tmp/bin/npm"
rm -rf "$tmp/repo/mos-app/node_modules"; rm -f "$STAMP"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
