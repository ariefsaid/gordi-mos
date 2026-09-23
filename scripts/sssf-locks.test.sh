#!/usr/bin/env bash
# Self-test for the lock wrappers (with-db-lock.sh / with-test-lock.sh over
# lib/flock-run.sh): rc propagation, mutual exclusion, and the re-entrancy
# passthrough — a wrapper nested inside its own hold must complete, not
# self-deadlock. Proves-it-can-fail by re-running the nested case with the
# held-var stripped (a broken guard turns into a timeout, exit 75).
set -uo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

for w in db test; do
  WRAP="scripts/with-${w}-lock.sh"
  VAR="MOS_$(echo "$w" | tr a-z A-Z)_LOCK"          # MOS_DB_LOCK / MOS_TEST_LOCK
  LOCK="$tmp/$w.lock"

  # rc propagation
  env "$VAR=$LOCK" "$WRAP" true >/dev/null 2>&1 \
    && ok "$w: wrapped success propagates rc 0" || bad "$w: rc 0 not propagated"
  env "$VAR=$LOCK" "$WRAP" false >/dev/null 2>&1
  [ $? -eq 1 ] && ok "$w: wrapped failure propagates rc 1" || bad "$w: rc 1 not propagated"

  # mutual exclusion: a second acquirer with a short timeout gives up with 75
  env "$VAR=$LOCK" "$WRAP" sleep 3 >/dev/null 2>&1 &
  holder=$!
  sleep 1
  env "$VAR=$LOCK" "${VAR}_TIMEOUT=1" "$WRAP" echo blocked >/dev/null 2>&1
  rc=$?
  [ $rc -eq 75 ] && ok "$w: second acquirer times out (EX_TEMPFAIL) while held" \
                 || bad "$w: expected 75 while held, got $rc"
  wait "$holder"

  # re-entrancy: the same wrapper nested inside its own hold completes
  out=$(env "$VAR=$LOCK" "${VAR}_TIMEOUT=3" "$WRAP" bash -c "$WRAP echo nested-ok" 2>/dev/null)
  rc=$?
  [ $rc -eq 0 ] && [ "$out" = "nested-ok" ] \
    && ok "$w: nested self-wrap passes through (no self-deadlock)" \
    || bad "$w: nested self-wrap failed (rc=$rc out=$out)"

  # prove the guard is what makes that work: strip the held-var in the inner
  # call — the un-guarded path must NOT complete (it times out with 75).
  env "$VAR=$LOCK" "${VAR}_TIMEOUT=2" "$WRAP" \
    bash -c "env -u ${VAR}_HELD $WRAP echo should-block" >/dev/null 2>&1
  rc=$?
  [ $rc -eq 75 ] && ok "$w: without the held-var the nested call deadlocks-to-timeout (guard is load-bearing)" \
                 || bad "$w: expected 75 with guard stripped, got $rc"
done

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
