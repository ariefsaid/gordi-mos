#!/usr/bin/env bash
#
# applied-path-check.sh — exercise the path a DEPLOYED database takes (#393).
#
# THE HOLE THIS CLOSES: CI always starts from nothing, so a migration written to be
# conditional on prior state ("drop constraint IF EXISTS", "if not exists then …") has a
# branch CI structurally cannot reach. The only environments that run it are the ones where
# being wrong is expensive. A green fresh-reset suite proves nothing about it.
#
# THE PROPERTY WE ASSERT — and it generalises to every future conditional migration:
#   a MIGRATED database is indistinguishable from a FRESHLY RESET one.
# Not "the migration ran without error" — indistinguishable, in the catalog facts that
# decide behaviour: CHECK constraints, foreign keys, and the catalog's own contents.
#
#   scripts/applied-path-check.sh              # both fingerprints, diff, exit 1 on drift
#   scripts/applied-path-check.sh --fresh-only # (used by the self-test's control)
#
# Runs INSIDE the shared DB lock — it resets the stack twice.
set -euo pipefail
cd "$(dirname "$0")/.."

# Reach the DB through the stack's OWN container: no psql on the host is required, and CI
# needs no extra apt step — the container is the one thing both environments always have.
DB_CONTAINER="${MOS_DB_CONTAINER:-supabase_db_gordi-mos}"
psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres "$@"; }

# The legacy state a deployed database carries and a fresh one never does: the CHECKs the
# catalog migration exists to remove. Sourced from the migration's own DOWN block, so the
# two cannot drift apart silently.
LEGACY_SQL="
alter table shared.teams            add constraint teams_activity_check            check (activity in ('kitchen','bar'));
alter table ops.kitchen_plans       add constraint kitchen_plans_activity_check    check (activity in ('kitchen','bar'));
alter table ops.kitchen_logs        add constraint kitchen_logs_activity_check     check (activity in ('kitchen','bar'));
alter table ops.kitchen_stock       add constraint kitchen_stock_activity_check    check (activity in ('kitchen','bar'));
alter table ops.stream_completeness add constraint stream_completeness_activity_check check (activity in ('kitchen','bar'));
"

# The fingerprint: the catalog facts that decide behaviour. Ordered so the comparison is
# textual and a drift names itself.
FINGERPRINT_SQL="
select 'CHECK' as kind, conrelid::regclass::text as rel, conname::text as name,
       pg_get_constraintdef(oid) as def
  from pg_constraint where contype = 'c'
   and connamespace in ('shared'::regnamespace,'ops'::regnamespace,'mos'::regnamespace,'integrations'::regnamespace)
union all
select 'FK', conrelid::regclass::text, conname::text, pg_get_constraintdef(oid)
  from pg_constraint where contype = 'f'
   and connamespace in ('shared'::regnamespace,'ops'::regnamespace,'mos'::regnamespace,'integrations'::regnamespace)
union all
select 'CATALOG', 'shared.activities', code, coalesce(name,'')
  from shared.activities
order by 1,2,3,4;
"

fingerprint() { psql_db -At -F'|' -c "$FINGERPRINT_SQL"; }

echo "── [1/3] fresh reset — the state CI always sees"
supabase db reset --local >/dev/null 2>&1
fingerprint > /tmp/mos-fp-fresh.txt
echo "   $(wc -l < /tmp/mos-fp-fresh.txt) catalog facts"

if [ "${1:-}" = "--fresh-only" ]; then echo "fresh-only: done"; exit 0; fi

echo "── [2/3] rebuild the DEPLOYED state — fresh + the legacy constraints a real database carries"
psql_db -q -v ON_ERROR_STOP=1 -c "$LEGACY_SQL"
legacy_n=$(psql_db -At -c "select count(*) from pg_constraint where conname like '%_activity_check'")
echo "   legacy CHECKs added: $legacy_n"
[ "$legacy_n" = "5" ] || { echo "the legacy state did not build (got $legacy_n, want 5) — the check would be vacuous" >&2; exit 2; }

echo "── [3/3] run ONLY the conditional block against it, then compare"
# NOT the whole migration: replaying it aborts at its first `create table` (the objects exist),
# so the drops would never run and the check would silently prove nothing. A deployed database
# reaches this block having already created those objects — the block IS the deployed path.
CONDITIONAL=$(awk '/^alter table .* drop constraint if exists .*_activity_check;/' \
  supabase/migrations/20260814000001_shared_activity_catalog.sql)
[ -n "$CONDITIONAL" ] || { echo "the conditional block was not found — has the migration been rewritten?" >&2; exit 2; }
echo "   replaying $(printf '%s\n' "$CONDITIONAL" | grep -c .) conditional statement(s)"
psql_db -q -v ON_ERROR_STOP=1 -c "$CONDITIONAL"
fingerprint > /tmp/mos-fp-migrated.txt

if diff -u /tmp/mos-fp-fresh.txt /tmp/mos-fp-migrated.txt > /tmp/mos-fp-diff.txt; then
  echo "✓ a migrated database is indistinguishable from a fresh one"
  exit 0
fi
echo "✗ DRIFT — the deployed path does NOT converge on the fresh state:" >&2
head -40 /tmp/mos-fp-diff.txt >&2
exit 1
