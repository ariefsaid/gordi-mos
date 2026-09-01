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
printf '1999996400\t120\tfull\t0123456789abcdef0123456789abcdef01234567\n1999999000\t180\tskipped\tabcdef0123456789abcdef0123456789abcdef01\n1999999500\t0\tfull\tfedcba9876543210fedcba9876543210fedcba98\n1999900000\t999\tfull\t0123456789abcdef0123456789abcdef01234567\n' > "$ledger"
out="$(VERIFY_LEDGER_PATH="$ledger" VERIFY_LEDGER_NOW=2000000000 bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q '3 runs, 5.00 total minutes, 33.33% skipped'; }
t "sums records in the requested window and excludes old records" $? "$out"

out="$(VERIFY_LEDGER_PATH="$tmp/missing.log" VERIFY_LEDGER_NOW=2000000000 bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q '0 runs, 0.00 total minutes, 0.00% skipped'; }
t "absent ledger reports zero cleanly" $? "$out"

printf 'not a ledger record\n' >> "$ledger"
out="$(VERIFY_LEDGER_PATH="$ledger" VERIFY_LEDGER_NOW=2000000000 bash "$SCRIPT" 24 2>&1)"; rc=$?
[ "$rc" -ne 0 ]; t "malformed ledger fails closed" $? "$out"
printf '%s' "$out" | grep -q 'ERROR malformed ledger record'; t "malformed ledger reports an error" $? "$out"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
