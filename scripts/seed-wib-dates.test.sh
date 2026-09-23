#!/usr/bin/env bash
# Self-test for #459: seed columns the APP reads as "today" must be seeded in Asia/Jakarta, never
# UTC `current_date`. The Café surfaces compute today via wibToday() (fixed +7h, NFR-007);
# Postgres in these containers is UTC. For seven hours of every day (00:00-07:00 WIB) the two
# disagree, so a `current_date` seed silently lands on yesterday and the surface renders empty
# with nothing on screen to explain it.
#
# Static check: no docker, no DB, runs in the guards lane. guards.yml also lists supabase/seed*.sql
# in its `paths:` filter — registering the step is only half the job, the trigger is the other half.
set -euo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# Files whose date columns the app reads as WIB "today". seed.dev-kitchen.sql is hand-loaded
# (not in config.toml's sql_paths) but is exactly the "developer seeds before breakfast" case.
SEED_FILES='supabase/seed.sql supabase/seed.dev-kitchen.sql'
JKT="(now() at time zone 'Asia/Jakarta')::date"

# `current_date` outside a quoted string. The (^|[^']) alternation matters: a bare [^'] cannot
# match at column 0, so an unindented occurrence would have been invisible (review finding).
BARE_UTC="(^|[^'])current_date"

scan() { # $1 = file → prints offending lines (prose comments excluded)
  grep -nE "$BARE_UTC" "$1" 2>/dev/null | grep -v '^[0-9]*:--' || true
}

for f in $SEED_FILES; do
  [ -f "$f" ] || { bad "$f is missing (list stale?)"; continue; }
  hits=$(scan "$f")
  if [ -n "$hits" ]; then
    bad "$f seeds at UTC current_date — the app reads these as WIB today:"
    printf '        %s\n' "$hits"
  else ok "$f carries no bare current_date"; fi
  if grep -qF "$JKT" "$f"; then ok "$f names the Jakarta expression"
  else bad "$f has no Jakarta date expression at all"; fi
done

# Can-fail control: run the REAL check over a copy of each real file reverted to current_date.
# Exercises the same scan() the loop uses, over every listed file — not a hardcoded literal, and
# not a second inline copy of the pattern that could drift from it (review finding).
control_failures=0
for f in $SEED_FILES; do
  tmp=$(mktemp -t seedwib.XXXXXX)   # mktemp, not a fixed /tmp path: parallel runs must not collide
  sed "s|$(printf '%s' "$JKT" | sed 's/[][\.*^$/]/\\&/g')|current_date|g" "$f" > "$tmp"
  [ -n "$(scan "$tmp")" ] && control_failures=$((control_failures+1))
  rm -f "$tmp"
done
if [ "$control_failures" -eq "$(printf '%s\n' $SEED_FILES | wc -w | tr -d ' ')" ]; then
  ok "control: every listed file trips the check when reverted (it can fail)"
else
  bad "control: $control_failures of $(printf '%s\n' $SEED_FILES | wc -w | tr -d ' ') reverted files tripped the check — it is vacuous for the rest"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
