#!/usr/bin/env bash
# Self-test for scripts/reporting_snapshot.py — the nightly warehouse→Supabase snapshot job.
#
# The job's unit suite lives in scripts/test_reporting_snapshot.py and, until this wrapper existed,
# ran in no lane at all. It now carries an acceptance criterion — that a run declares the org it
# writes, in the transaction that writes it — so it has to gate somewhere a machine will notice.
#
# Hermetic: no database, no network. The run tests substitute a recording stand-in for psycopg.
set -uo pipefail
cd "$(dirname "$0")"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# 1. The whole suite is green.
out=$(python3 -m unittest test_reporting_snapshot 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then ok "scripts/test_reporting_snapshot.py passes"
else bad "scripts/test_reporting_snapshot.py failed"; printf '%s\n' "$out"; fi

# 2. A green that ran nothing is not a green. Name the org-scope class explicitly: if it is renamed
#    away or emptied, this check goes red rather than the suite quietly shrinking underneath it.
org_out=$(python3 -m unittest test_reporting_snapshot.OrgScopedRunTests 2>&1); org_rc=$?
org_ran=$(printf '%s' "$org_out" | sed -n 's/^Ran \([0-9]*\) tests\{0,1\}.*/\1/p' | tail -1)
if [ "$org_rc" -eq 0 ] && [ "${org_ran:-0}" -ge 3 ]; then
  ok "OrgScopedRunTests ran ${org_ran} tests, all green"
else
  bad "OrgScopedRunTests missing or not green (rc=${org_rc}, ran=${org_ran:-0})"
  printf '%s\n' "$org_out"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
