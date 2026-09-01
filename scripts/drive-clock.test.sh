#!/usr/bin/env bash
# Self-test for the wall-clock ledger reporter.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/drive-clock.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL  %s — got: %s\n' "$1" "$3"; fi; }

ledger="$tmp/verify-ledger.log"
printf '1999996400\t120\tfull\t0123456789abcdef0123456789abcdef01234567\n1999999000\t180\tskipped\tabcdef0123456789abcdef0123456789abcdef01\n1999999500\t0\tfull\tfedcba9876543210fedcba9876543210fedcba98\n1999999600\t0\trefused\t0123456789abcdef0123456789abcdef01234567\n1999900000\t999\tfull\t0123456789abcdef0123456789abcdef01234567\n' > "$ledger"
out="$(VERIFY_LEDGER_PATH="$ledger" VERIFY_LEDGER_NOW=2000000000 bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q '3 runs, 5.00 total minutes, 33.33% skipped, 1 refusals'; }
t "sums records in the requested window and excludes old records" $? "$out"

out="$(VERIFY_LEDGER_PATH="$tmp/missing.log" VERIFY_LEDGER_NOW=2000000000 bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q '0 runs, 0.00 total minutes, 0.00% skipped, 0 refusals'; }
t "absent ledger reports zero cleanly" $? "$out"

printf 'not a ledger record\n' >> "$ledger"
out="$(VERIFY_LEDGER_PATH="$ledger" VERIFY_LEDGER_NOW=2000000000 bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q '3 runs, 5.00 total minutes, 33.33% skipped, 1 refusals'; }
t "ancient corrupt records do not brick a report" $? "$out"
printf '2000000000\tbad\tfull\t0123456789abcdef\n' >> "$ledger"
out="$(VERIFY_LEDGER_PATH="$ledger" VERIFY_LEDGER_NOW=2000000000 bash "$SCRIPT" 24 2>&1)"; rc=$?
[ "$rc" -ne 0 ]; t "in-window malformed ledger fails closed" $? "$out"
printf '%s' "$out" | grep -q 'ERROR malformed ledger record'; t "in-window malformed ledger reports an error" $? "$out"

# A real linked worktree must append to the common ledger seen by the main checkout.
fixture="$tmp/worktree-fixture"; linked="$tmp/worktree-linked"
git init -q "$fixture" && git -C "$fixture" config user.email t@t && git -C "$fixture" config user.name t
mkdir -p "$fixture/scripts"; cp "$SCRIPT" "$fixture/scripts/drive-clock.sh"
touch "$fixture/file"; git -C "$fixture" add -A; git -C "$fixture" commit -qm init
git -C "$fixture" worktree add -q -b linked "$linked"
linked_head="$(git -C "$linked" rev-parse HEAD)"
common="$(git -C "$linked" rev-parse --path-format=absolute --git-common-dir)"
printf '1999999900\t60\tfull\t%s\n' "$linked_head" >> "$common/verify-ledger.log"
out="$(cd "$fixture" && VERIFY_LEDGER_NOW=2000000000 bash scripts/drive-clock.sh 24)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q '1 runs, 1.00 total minutes'; }
t "linked-worktree append is visible to main-checkout report" $? "$out"

mkdir -p "$tmp/not-a-repo"
out="$(cd "$tmp/not-a-repo" && bash "$SCRIPT" 24 2>&1)"; rc=$?
[ "$rc" -ne 0 ]; t "outside a git repository errors" $? "$out"
printf '%s' "$out" | grep -q 'ERROR not inside a git repository'; t "outside-repo error is explicit" $? "$out"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
