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

# The test lock is a 3-slot semaphore by default; these mutex cases pin it to one slot.
export MOS_TEST_LOCK_SLOTS=1
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

unset MOS_TEST_LOCK_SLOTS

# semaphore: three test suites run at once; the fourth waits and gives up with 75
SEM="$tmp/sem.lock"
for i in 1 2 3; do env MOS_TEST_LOCK="$SEM" scripts/with-test-lock.sh sleep 4 >/dev/null 2>&1 & done
sleep 1
env MOS_TEST_LOCK="$SEM" MOS_TEST_LOCK_TIMEOUT=1 scripts/with-test-lock.sh echo fourth >/dev/null 2>&1
rc=$?
[ $rc -eq 75 ] && ok "test: the fourth suite waits behind three holders (default 3 slots)" \
               || bad "test: expected 75 behind three holders, got $rc"
wait
[ -e "$SEM" ] && [ -e "$SEM.1" ] && [ -e "$SEM.2" ] && [ ! -e "$SEM.3" ] \
  && ok "test: the slots are the lock path, .1 and .2" || bad "test: unexpected slot files: $(ls "$tmp" | grep sem | tr '\n' ' ')"
# a nested db lock inside a test slot stays a plain mutex (FLOCK_SLOTS is not inherited)
env MOS_TEST_LOCK="$SEM" MOS_DB_LOCK="$tmp/nested-db.lock" scripts/with-test-lock.sh scripts/with-db-lock.sh true >/dev/null 2>&1
[ -e "$tmp/nested-db.lock" ] && [ ! -e "$tmp/nested-db.lock.1" ] \
  && ok "db: nested inside a test slot it stays a single lock" || bad "db: nested lock grew extra slots"

# a garbage slot count is misuse (exit 2); an absurd one is capped at 16 files
env MOS_TEST_LOCK="$tmp/bad.lock" MOS_TEST_LOCK_SLOTS=three scripts/with-test-lock.sh true >/dev/null 2>&1
[ $? -eq 2 ] && ok "test: a non-numeric slot count exits 2" || bad "test: non-numeric slot count did not exit 2"
env MOS_TEST_LOCK="$tmp/big.lock" MOS_TEST_LOCK_SLOTS=1000000 scripts/with-test-lock.sh true >/dev/null 2>&1
[ "$(ls "$tmp" | grep -c '^big\.lock')" = 16 ] && ok "test: the slot count is capped at 16" || bad "test: expected 16 slot files, got $(ls "$tmp" | grep -c '^big\.lock')"

# default path: with no override the test lock is the one shared with the sibling repo, under $HOME
mkdir -p "$tmp/home"
env -u MOS_TEST_LOCK -u MOS_TEST_LOCK_HELD HOME="$tmp/home" scripts/with-test-lock.sh true >/dev/null 2>&1
[ -e "$tmp/home/.pmo-test.lock" ] && [ "$(ls -A "$tmp/home" | grep -vc '^\.pmo-test\.lock')" = 0 ] \
  && ok "test: default lock (MOS_TEST_LOCK unset) is \$HOME/.pmo-test.lock" \
  || bad "test: default lock is not \$HOME/.pmo-test.lock (found: $(ls -A "$tmp/home" | tr '\n' ' '))"

# Default wait: 2700 s (45 min) unless the *_TIMEOUT env var says otherwise; 0 still means forever.
# A copy of each wrapper runs over a stub flock-run.sh that records the timeout it was handed.
mkdir -p "$tmp/stub/lib"
printf '#!/bin/sh\necho "$3" > "%s/timeout-arg"\n' "$tmp" > "$tmp/stub/lib/flock-run.sh"; chmod +x "$tmp/stub/lib/flock-run.sh"
for w in db test; do
  cp "scripts/with-${w}-lock.sh" "$tmp/stub/"; VAR="MOS_$(echo "$w" | tr a-z A-Z)_LOCK"
  env -u "${VAR}_TIMEOUT" -u "${VAR}_HELD" "$VAR=$tmp/$w.lock" bash "$tmp/stub/with-${w}-lock.sh" true >/dev/null 2>&1
  [ "$(cat "$tmp/timeout-arg" 2>/dev/null)" = 2700 ] && ok "$w: default wait is 2700 s" || bad "$w: default wait is not 2700 s ($(cat "$tmp/timeout-arg" 2>/dev/null))"
  env -u "${VAR}_HELD" "${VAR}_TIMEOUT=0" "$VAR=$tmp/$w.lock" bash "$tmp/stub/with-${w}-lock.sh" true >/dev/null 2>&1
  [ "$(cat "$tmp/timeout-arg" 2>/dev/null)" = 0 ] && ok "$w: ${VAR}_TIMEOUT=0 still waits forever" || bad "$w: the 0 override was not passed through"
done

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
