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
git -C "$tmp/repo" reset -q

# The staged-source lane must stay tied to staged app sources when global Vite config is
# staged too. Vitest's `related` command accepts the union of source paths; `--changed HEAD`
# derives selection from checkout-wide changes, including unstaged files.
stub="$tmp/stub"; mkdir -p "$stub"
cat > "$stub/npx" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$NPX_ARGV_LOG"
if [ "${NPX_MODE:-}" = "fail-vitest" ] && [ "$1" = "vitest" ]; then
  seq 1 4000 | sed 's/^/verbose diagnostic /'
  printf '⎯⎯ Failed Tests 1 ⎯⎯\n'
  printf ' FAIL  src/pages/login-page.test.tsx > login rejects invalid credentials\n'
  printf 'AssertionError: expected false to be true\n'
  exit 1
fi
exit 0
STUB
chmod +x "$stub/npx"

mkdir -p "$tmp/repo/mos-app/node_modules" "$tmp/repo/mos-app/src"
echo "export default {}" > "$tmp/repo/mos-app/vite.config.ts"
git -C "$tmp/repo" add mos-app/vite.config.ts
export NPX_ARGV_LOG="$tmp/npx-argv.log"
: > "$NPX_ARGV_LOG"
(cd "$tmp/repo" && PATH="$stub:$PATH" bash "$HOOK") >/dev/null 2>&1
if grep -q '^vitest ' "$NPX_ARGV_LOG"; then
  fail=$((fail+1)); printf '  FAIL  global config change alone does not invoke vitest\n'
else
  pass=$((pass+1)); printf '  ok    global config change alone does not invoke vitest\n'
fi
git -C "$tmp/repo" reset -q

echo "export const a = 1" > "$tmp/repo/mos-app/src/one.ts"
echo "export const b = 2" > "$tmp/repo/mos-app/src/two.ts"
git -C "$tmp/repo" add mos-app/vite.config.ts mos-app/src/one.ts mos-app/src/two.ts
: > "$NPX_ARGV_LOG"
(cd "$tmp/repo" && PATH="$stub:$PATH" bash "$HOOK") >/dev/null 2>&1
vitest_argv="$(grep '^vitest ' "$NPX_ARGV_LOG" || true)"
if [[ "$vitest_argv" == *"vitest related --run --reporter=dot src/one.ts src/two.ts src/guard-no-company-email-domain.test.ts"* ]] && [[ "$vitest_argv" != *"--changed"* ]]; then
  pass=$((pass+1)); printf '  ok    staged sources use scoped tests and retain the domain guard\n'
else
  fail=$((fail+1)); printf '  FAIL  staged sources use scoped tests and retain the domain guard; got: %s\n' "$vitest_argv"
fi

# A noisy failure must leave its complete log on disk while presenting only the test/error
# summary to the committer. The hook self-test deliberately makes the fake Vitest emit 4k lines.
: > "$NPX_ARGV_LOG"
hook_output="$tmp/hook-failure.out"
if (cd "$tmp/repo" && NPX_MODE=fail-vitest PATH="$stub:$PATH" bash "$HOOK") >"$hook_output" 2>&1; then
  rc=0
else
  rc=$?
fi
log_path="$(sed -n 's/^Full Vitest log: //p' "$hook_output" | tail -n 1)"
if [ "$rc" -eq 1 ] && grep -q 'login rejects invalid credentials' "$hook_output" && \
   grep -q 'AssertionError: expected false to be true' "$hook_output" && \
   [ -s "$log_path" ] && [ "$(wc -l < "$log_path")" -ge 4003 ] && \
   [ "$(wc -l < "$hook_output")" -lt 80 ]; then
  pass=$((pass+1)); printf '  ok    Vitest failure is concise and full log is retained\n'
else
  fail=$((fail+1)); printf '  FAIL  concise Vitest failure with retained full log\n'
fi
[ -n "$log_path" ] && rm "$log_path"
git -C "$tmp/repo" reset -q

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
