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
ledger="$tmp/repo/.git/verify-ledger.log"
[ "$(wc -l < "$ledger" 2>/dev/null | tr -d ' ')" = 1 ] && ok "refused run appends one ledger record" || bad "refused run did not append one ledger record"
awk -F '\t' -v head="$HEAD" 'NF == 4 && $3 == "refused" && $4 == head { found=1 } END { exit !found }' "$ledger" 2>/dev/null
[ "$?" -eq 0 ] && ok "refused ledger record captures refused mode and HEAD" || bad "ledger record is missing refused mode or HEAD"
git -C "$tmp/repo" checkout -q f

if run; then ok "green battery passes"; else bad "green battery must pass"; fi
if [ "$(cat "$STAMP" 2>/dev/null)" = "$HEAD" ]; then ok "stamp equals HEAD sha"; else bad "stamp missing or wrong sha"; fi
[ "$(wc -l < "$ledger" 2>/dev/null | tr -d ' ')" = 2 ] && ok "green run appends one additional ledger record" || bad "green run ledger count is wrong"

rm -f "$STAMP"
printf '#!/bin/sh\ncase "$*" in *test*) exit 1;; *) exit 0;; esac\n' > "$tmp/bin/npm"
if run; then bad "red battery must refuse"; else ok "red battery refuses"; fi
[ ! -f "$STAMP" ] && ok "no stamp after red battery" || bad "stamp written despite red battery"
[ "$(tail -n 1 "$ledger" | cut -f3)" = refused ] && ok "red battery records refused mode" || bad "red battery did not record refused mode"

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
      typecheck)       need=tsc ;;
      build)           need="tsc vite" ;;
      lint)            need="eslint stylelint" ;;
      test:coverage)   need=vitest ;;
      *)               need=tsc ;;
    esac
    for b in \$need; do
      if [ ! -x "node_modules/.bin/\$b" ]; then
        echo "sh: \$b: command not found" >&2
        exit 127
      fi
    done
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
for _miss in eslint stylelint vitest vite; do
  rm -f "$tmp/repo/mos-app/node_modules/.bin/$_miss"
touch -t 202001010000 "$tmp/repo/mos-app/package-lock.json"
touch "$tmp/repo/mos-app/node_modules/.package-lock.json"
: > "$npm_log"; rm -f "$STAMP"; run
  if installed && [ -f "$STAMP" ]; then ok "installs when $_miss is missing"
  else bad "a tsc-present/$_miss-missing tree is unhealed — the probe list has members no case covers (stamp=$([ -f "$STAMP" ] && echo yes || echo no))"; fi
  printf '#!/bin/sh\nexit 0\n' > "$tmp/repo/mos-app/node_modules/.bin/$_miss"; chmod +x "$tmp/repo/mos-app/node_modules/.bin/$_miss"
done

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

# ── Diff scoping: the npm lane runs only when the diff could break the app; FAIL CLOSED
# without a base. The recording stub proves invocation, not just exit status.
printf '#!/bin/sh\necho called >> "%s/npm-calls"\nexit 0\n' "$tmp" > "$tmp/bin/npm"; chmod +x "$tmp/bin/npm"
G() { git -C "$tmp/repo" -c user.email=t@t -c user.name=t "$@"; }
scope_case() { # $1 name · $2 file-to-change · $3 expect-npm yes/no
  local name="$1" file="$2" want="$3"
  rm -f "$tmp/npm-calls" "$STAMP"
  mkdir -p "$tmp/repo/$(dirname "$file")"
  echo "x$RANDOM" >> "$tmp/repo/$file"; G add "$file"; G commit -qm "touch $file"
  run
  local got=no; [ -s "$tmp/npm-calls" ] && got=yes
  local stamped=no; [ "$(cat "$STAMP" 2>/dev/null)" = "$(G rev-parse HEAD)" ] && stamped=yes
  local expected_mode=full; [ "$want" = no ] && expected_mode=skipped
  local actual_mode; actual_mode="$(tail -n 1 "$tmp/repo/.git/verify-ledger.log" | cut -f3)"
  if [ "$got" = "$want" ] && [ "$stamped" = yes ] && [ "$actual_mode" = "$expected_mode" ]; then pass=$((pass+1)); printf '  ok    scope: %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  scope: %s — npm=%s (want %s) stamped=%s mode=%s\n' "$name" "$got" "$want" "$stamped" "$actual_mode"; fi
}
# Manufacture the base ref the scoping reads — a skip here would be a can't-fail check.
G update-ref refs/remotes/origin/dev "$(G rev-parse HEAD)"
scope_case "docs/scripts-only diff skips the npm lane" "scripts/some-guard.sh" no
scope_case "mos-app diff runs the npm lane" "mos-app/src/thing.ts" yes
scope_case "supabase diff runs the npm lane" "supabase/migrations/x.sql" yes
scope_case "UNRECOGNIZED path runs the lane (allowlist polarity, rename-out class)" "shared/mod.ts" yes
# The SIGPIPE regression: a >64KB path list with ONE unlisted path must still run the lane —
# grep -q early-exit killed the producer and read the match as absent (flash round 4, 5/5 repro).
rm -f "$tmp/npm-calls" "$STAMP"
mkdir -p "$tmp/repo/scripts/bulk" "$tmp/repo/a-unlisted"
for i in $(seq 1 4999); do : > "$tmp/repo/scripts/bulk/file-$i-padding-padding-padding.sh"; done
: > "$tmp/repo/a-unlisted/needle.ts"   # sorts BEFORE scripts/ so the old -q form early-exits — the can-fail ordering
G add scripts/bulk a-unlisted; G commit -qm "bulk + one unlisted"
run
if [ -s "$tmp/npm-calls" ]; then pass=$((pass+1)); printf '  ok    scope: 64KB+ diff with one unlisted path still runs the lane (SIGPIPE race)\n'
else fail=$((fail+1)); printf '  FAIL  scope: SIGPIPE race — big diff skipped the lane\n'; fi

# ── Ledger serialization: linked worktrees share one ledger through the common git dir, so a
# run must not append while another writer holds the ledger lock — and concurrent appends
# must each land as one intact record.
rm -f "$STAMP"
: > "$tmp/repo/untracked-race"   # instant refusal: no npm, no test lock, just the EXIT-trap append
ledger_lock="$tmp/repo/.git/verify-ledger.lock"
before="$(wc -l < "$ledger" 2>/dev/null | tr -d ' ')"; before="${before:-0}"
"$PWD/scripts/lib/flock-run.sh" ledger-lock "$ledger_lock" 0 "" "" -- sleep 4 2>"$tmp/holder.log" &
holder=$!
n=0; until grep -q ACQUIRED "$tmp/holder.log" 2>/dev/null || [ "$n" -ge 100 ]; do sleep 0.1; n=$((n+1)); done
( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" bash scripts/pre-pr-verify.sh ) >"$tmp/race.log" 2>&1 &
race=$!
n=0; until grep -q 'worktree is dirty' "$tmp/race.log" 2>/dev/null || [ "$n" -ge 100 ]; do sleep 0.1; n=$((n+1)); done
sleep 1   # a generous beat: an unlocked append lands within milliseconds of the refusal
if [ "$(wc -l < "$ledger" | tr -d ' ')" = "$before" ]; then ok "run does not append while the ledger lock is held"
else bad "appended while another writer held the ledger lock (append is not serialized)"; fi
wait "$holder"
wait "$race"; [ "$?" -ne 0 ] && ok "serialized run still refuses on the dirty tree" || bad "serialized run lost its refusal"
[ "$(wc -l < "$ledger" | tr -d ' ')" = "$((before + 1))" ] && ok "deferred append lands once the lock frees" || bad "deferred append never landed"
( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" bash scripts/pre-pr-verify.sh ) >/dev/null 2>&1 & r1=$!
( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" bash scripts/pre-pr-verify.sh ) >/dev/null 2>&1 & r2=$!
wait "$r1"; wait "$r2"
tail -n 2 "$ledger" | awk -F '\t' '$3 == "refused" && NF == 4 { n++ } END { exit !(n == 2) }' \
  && ok "two concurrent appends produce two intact lines" || bad "concurrent appends corrupted the ledger"
rm -f "$tmp/repo/untracked-race"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
