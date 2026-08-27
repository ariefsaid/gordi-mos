#!/usr/bin/env bash
# Self-test for .githooks/commit-msg. Every guard ships one; this hook shipped without, so its
# warn-on-missing-script path — the whole reason it was softened — was never exercised.
set -uo pipefail
cd "$(dirname "$0")/.."
HOOK="$(pwd)/.githooks/commit-msg"
GUARD="$(pwd)/scripts/claim-check.sh"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git init -q "$tmp/repo"; mkdir -p "$tmp/repo/scripts"
cp "$GUARD" "$tmp/repo/scripts/claim-check.sh"
run() { (cd "$tmp/repo" && bash "$HOOK" "$1") >/dev/null 2>&1; }

printf 'fix: an ordinary subject\n' > "$tmp/m"
run "$tmp/m" && ok "a clean message passes" || bad "a clean message was refused"

printf 'fix: the widget was published on 2024-01-01\n' > "$tmp/m"
run "$tmp/m" && bad "an incident line PASSED" || ok "an incident line is refused"

# The softening exists for sparse worktrees and fixture repos with no scripts/. It hard-failed 127
# there once while pre-commit warned, so the softening never actually worked.
rm -f "$tmp/repo/scripts/claim-check.sh"
printf 'fix: an ordinary subject\n' > "$tmp/m"
run "$tmp/m" && ok "missing claim-check.sh warns, does not block" \
             || bad "missing claim-check.sh BLOCKED the commit"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
