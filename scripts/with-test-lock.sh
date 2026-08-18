#!/usr/bin/env bash
#
# with-test-lock.sh — machine-global mutual exclusion for the HEAVY NON-DB unit
# suite, so only ONE full suite runs on this host at a time. Under many parallel
# agent worktrees, two concurrent full runs starve each other for CPU and
# produce FALSE REDs on render timeouts — a DIFFERENT test set each time, every
# one green in isolation (the tell that it is contention, not a regression: a
# real regression fails the same test deterministically; contention moves).
# Wrap the whole run:
#
#   scripts/with-test-lock.sh bash -c 'cd mos-app && npm test'
#
# This serialises the test SUITE only. It is INDEPENDENT of the db lock (which
# serialises DB work) — the unit suite is mocked and needs no stack, but two
# suites hammering the same CPU/RAM is the contention. Cooperative: it only
# works if ALL agents route heavy test runs through it. Scoped to this project
# (own lock file), so sibling projects on this host are unaffected.
#
# ── ACQUISITION ORDER (outermost first): db -> test ──────────────────────────
# This is the INNERMOST lock — acquire it LAST (only after db if a command needs
# both). See scripts/lib/flock-run.sh.
#
#   MOS_TEST_LOCK          override the lock path (default ~/.mos-test.lock)
#   MOS_TEST_LOCK_TIMEOUT  seconds to wait before giving up (default: wait forever)
set -euo pipefail

LOCK="${MOS_TEST_LOCK:-$HOME/.mos-test.lock}"
TIMEOUT="${MOS_TEST_LOCK_TIMEOUT:-0}"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command...>   (wraps a heavy test-suite command in the shared lock)" >&2
  exit 2
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/lib/flock-run.sh" "test-lock" "$LOCK" "$TIMEOUT" "MOS_TEST_LOCK_HELD" \
  "the shared test suite" -- "$@"
