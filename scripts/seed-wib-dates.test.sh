#!/usr/bin/env bash
# Self-test for #459: date-valued seed columns that the APP reads as "today" must be seeded in
# Asia/Jakarta, never UTC `current_date`. The app's Café surfaces compute today via wibToday()
# (fixed +7h, NFR-007); Postgres in these containers is UTC. For seven hours of every day
# (00:00-07:00 WIB) the two disagree, and a `current_date` seed silently lands on yesterday —
# every Café Plan surface renders empty with nothing on screen to explain it. That is what
# reddened the geometry lane on passing code (#459).
#
# Static check: no docker, no DB, runs in the guards lane.
set -euo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# The columns the app reads as "today WIB". Extend this list when a new one appears.
WIB_TABLES='ops.kitchen_plans'
JKT="(now() at time zone 'Asia/Jakarta')::date"

# 1. every insert into a WIB-read table uses the Jakarta expression for log_date
for t in $WIB_TABLES; do
  # the insert block: from the insert line to the terminating semicolon
  block=$(awk "/insert into ${t//./\\.}/,/;/" supabase/seed.sql)
  if [ -z "$block" ]; then bad "no seeded insert found for $t (list stale?)"; continue; fi
  if printf '%s' "$block" | grep -qE "[^']current_date"; then
    bad "$t is seeded at UTC current_date — the app reads it as WIB today"
  else ok "$t is seeded at the Jakarta date, not UTC"; fi
  if printf '%s' "$block" | grep -qF "$JKT"; then
    ok "$t names the Jakarta expression explicitly"
  else bad "$t does not carry the Jakarta date expression"; fi
done

# 2. can-fail control: the same check against a copy reverted to current_date must FAIL,
#    proving the check tracks the file rather than grep semantics.
reverted=$(sed "s|(now() at time zone 'Asia/Jakarta')::date|current_date|g" supabase/seed.sql)
rblock=$(printf '%s' "$reverted" | awk '/insert into ops\.kitchen_plans/,/;/')
if printf '%s' "$rblock" | grep -qE "[^']current_date"; then
  ok "control: the reverted copy trips the check (it can fail)"
else bad "control: the reverted copy did NOT trip the check — the check is vacuous"; fi

# 3. the reasoning survives next to the code, not only in a ticket
if grep -q "Asia/Jakarta" supabase/seed.sql && grep -qi "seven hours\|00:00-07:00" supabase/seed.sql; then
  ok "the seed states WHY, at the seam"
else bad "the seed carries no explanation of the WIB/UTC split"; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
