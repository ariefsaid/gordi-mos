#!/usr/bin/env bash
# Self-test for .githooks/pre-commit — every refusal it claims, the passes, and the
# SIGPIPE regression a review found (marker early in a large diff must still refuse).
set -uo pipefail
cd "$(dirname "$0")/.."
HOOK="$(pwd)/.githooks/pre-commit"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

check() { # $1 name · $2 expected rc · $3.. command runs inside the scratch repo
  local name="$1" want="$2" rc
  (cd "$tmp/repo" && bash "$HOOK") >/dev/null 2>&1; rc=$?
  if [ "$rc" -eq "$want" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — expected rc=%s, got rc=%s\n' "$name" "$want" "$rc"; fi
}

git init -q "$tmp/repo"
git -C "$tmp/repo" config user.email t@t && git -C "$tmp/repo" config user.name t

check "nothing staged passes" 0

echo clean > "$tmp/repo/a.md"
git -C "$tmp/repo" add a.md
check "clean staged file passes" 0
git -C "$tmp/repo" commit -qm init

printf 'x\n<<<<<<< HEAD\ny\n>>>>>>> other\n' > "$tmp/repo/conflict.md"
git -C "$tmp/repo" add conflict.md
check "staged conflict markers refuse" 1
git -C "$tmp/repo" reset -q

# Regression: under pipefail, `grep -q` used to SIGPIPE `git diff` on a large staged
# diff and the check came out GREEN with markers present. grep -c must refuse.
{ printf '<<<<<<< HEAD\nx\n>>>>>>> other\n'; seq 1 200000; } > "$tmp/repo/big.md"
git -C "$tmp/repo" add big.md
check "marker early in a 200k-line diff still refuses" 1
git -C "$tmp/repo" reset -q

git -C "$tmp/repo" rm -q a.md
check "pure deletion passes (diff-filter)" 0
git -C "$tmp/repo" reset -q

# No mos-app/node_modules in the scratch repo: staged TS must skip lint, not block.
mkdir -p "$tmp/repo/mos-app/src"
echo "const x:number=1" > "$tmp/repo/mos-app/src/f.ts"
git -C "$tmp/repo" add mos-app/src/f.ts
check "missing node_modules skips lint instead of blocking" 0

# The vitest lane ran nothing for months: `vitest related a.ts b.ts` reads everything
# after the first file as a FILENAME FILTER, matches no test file, and exits 0. The lane
# is too heavy to run for real here, so this pins the INVOCATION SHAPE instead — a stub
# `npx` records argv and the assertion refuses the silently-empty form.
stub="$tmp/stub"; mkdir -p "$stub"
cat > "$stub/npx" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$NPX_ARGV_LOG"
exit 0
STUB
chmod +x "$stub/npx"

mkdir -p "$tmp/repo/mos-app/node_modules" "$tmp/repo/mos-app/src"
echo "export const a = 1" > "$tmp/repo/mos-app/src/one.ts"
echo "export const b = 2" > "$tmp/repo/mos-app/src/two.ts"
git -C "$tmp/repo" add mos-app/src/one.ts mos-app/src/two.ts
export NPX_ARGV_LOG="$tmp/npx-argv.log"
: > "$NPX_ARGV_LOG"
(cd "$tmp/repo" && PATH="$stub:$PATH" bash "$HOOK") >/dev/null 2>&1
vitest_argv="$(grep '^vitest' "$NPX_ARGV_LOG" || true)"
if [ -z "$vitest_argv" ]; then
  fail=$((fail+1)); printf '  FAIL  two staged sources invoke vitest — nothing was invoked\n'
elif [[ "$vitest_argv" == *"related"* ]]; then
  fail=$((fail+1)); printf '  FAIL  vitest lane uses the no-op multi-file `related` form: %s\n' "$vitest_argv"
else
  pass=$((pass+1)); printf '  ok    two staged sources invoke a vitest form that runs tests\n'
fi
git -C "$tmp/repo" reset -q

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
