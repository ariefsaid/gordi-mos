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

# ── block 1b: the claim-check call ───────────────────────────────────────────────
# The scratch repo has no scripts/claim-check.sh, which is exactly the sparse-tree case the hook
# warns about instead of blocking. Prove BOTH halves: absent = warn, present = enforce.
printf '# the widget was published on 2024-01-01\n' > "$tmp/repo/note.md"
git -C "$tmp/repo" add note.md
check "no claim-check.sh present: warns, does not block" 0

mkdir -p "$tmp/repo/scripts"
cp "$(dirname "$HOOK")/../scripts/claim-check.sh" "$tmp/repo/scripts/claim-check.sh"
check "claim-check.sh present: an incident line is refused" 1

printf '# ruling 2024-01-01: the widget gets a bar stream\n' > "$tmp/repo/note.md"
git -C "$tmp/repo" add note.md
check "claim-check.sh present: a bare ruling date passes" 0
git -C "$tmp/repo" reset -q; rm -rf "$tmp/repo/note.md" "$tmp/repo/scripts"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
