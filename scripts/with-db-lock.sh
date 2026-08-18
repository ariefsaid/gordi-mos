#!/usr/bin/env bash
#
# with-db-lock.sh — mutual exclusion for THIS PROJECT's single local Supabase
# stack across parallel agents. The local stack is one Docker stack (one DB);
# two agents running `supabase db reset` / `supabase test db` / Playwright e2e
# at once corrupt each other. Wrap EVERY DB-driving command in this so only one
# runs at a time; others block until it frees.
#
#   scripts/with-db-lock.sh supabase db reset --yes
#   scripts/with-db-lock.sh supabase test db
#
# DEFAULT for a reset+test pair: chain them as ONE lock hold so a sibling
# worktree's reset cannot apply a different migration set in between (a mid-run
# drift produces both FALSE REDs and FALSE GREENs):
#
#   scripts/with-db-lock.sh bash -c 'supabase db reset && supabase test db'
#
# Cooperative: it only works if ALL agents route DB work through it. The lock is
# a machine-global file shared across every clone/worktree of THIS project on
# this host — but scoped to this project, so sibling projects' stacks are never
# blocked or reset by it. Taken via fcntl.flock — an ADVISORY OS lock the kernel
# releases automatically the instant the holding process exits (crash included),
# so there is no stale lock to clean up. macOS has no flock(1), hence python3
# (stdlib fcntl; always present). The flock core lives in scripts/lib/flock-run.sh.
#
# ── ACQUISITION ORDER (outermost first): db -> test ──────────────────────────
# This is the OUTERMOST lock — acquire it FIRST. (with-test-lock.sh nests inside
# it; see scripts/lib/flock-run.sh.)
#
#   MOS_DB_LOCK          override the lock path (default ~/.mos-supabase-db.lock)
#   MOS_DB_LOCK_TIMEOUT  seconds to wait before giving up (default: wait forever)
set -euo pipefail

LOCK="${MOS_DB_LOCK:-$HOME/.mos-supabase-db.lock}"
TIMEOUT="${MOS_DB_LOCK_TIMEOUT:-0}"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command...>   (wraps a DB-driving command in the shared lock)" >&2
  exit 2
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/lib/flock-run.sh" "db-lock" "$LOCK" "$TIMEOUT" "MOS_DB_LOCK_HELD" \
  "the shared local Supabase DB" -- "$@"
