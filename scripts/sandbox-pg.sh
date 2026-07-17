#!/usr/bin/env bash
# sandbox-pg.sh — stand up the pgTAP calibration suite WITHOUT Docker.
#
# WHY THIS EXISTS: this sandbox cannot pull the supabase/postgres Docker image (container-registry
# blob CDNs are blocked at the egress proxy — cloudfront.docker.com, ECR's cloudfront,
# pkg-containers.githubusercontent.com), so `supabase start` / `supabase test db` do not work here.
# This script reproduces just enough of the real Supabase Postgres image on the SYSTEM PostgreSQL
# (apt: postgresql-16 + postgresql-16-pgtap) to apply supabase/migrations/*.sql and run
# supabase/tests/*.sql (pgTAP) via pg_prove. It does NOT run GoTrue/PostgREST/Kong — this is the
# DB-only path (pgTAP), not a logged-in app (see docs on Priority 2 for that gap: PostgREST has no
# reachable install channel in this sandbox — see the report this script's calibration run produced).
#
# Idempotent: safe to re-run. Each run DROPs and re-creates the sandbox database from scratch (the
# same "fresh state" guarantee `supabase db reset` gives you), then re-applies bootstrap + all
# migrations + all seeds in the same order supabase/config.toml's `[db.seed] sql_paths` uses.
#
# Usage:
#   bash scripts/sandbox-pg.sh              # bootstrap + migrate + seed
#   bash scripts/sandbox-pg.sh --no-seed     # bootstrap + migrate only (skip seed*.sql)
#
# After it succeeds, run the pgTAP suite (CI's `supabase test db` equivalent):
#   sudo -u postgres pg_prove -U postgres -d gordi_mos_sandbox --host /var/run/postgresql \
#     --ext .sql supabase/tests/*.sql
#
# This script never touches Docker, never touches any cloud/staging Supabase project, and only
# talks to the local system PostgreSQL instance (unix socket, `postgres` OS/DB superuser).

set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
DB="${SANDBOX_PG_DB:-gordi_mos_sandbox}"
PG_CLUSTER_VERSION="16"
PG_CLUSTER_NAME="main"
SEED="1"

for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED="0" ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }
psql_super() { sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"; }

# ── 0. Preconditions ─────────────────────────────────────────────────────────────
command -v psql >/dev/null || die "no psql. apt install postgresql-client-$PG_CLUSTER_VERSION"
command -v pg_prove >/dev/null || die "no pg_prove. apt install libtap-parser-sourcehandler-pgtap-perl"
sudo -n true 2>/dev/null || die "need passwordless sudo to run commands as the postgres OS/DB user"

# ── 1. Make sure the system PostgreSQL 16 cluster is running ───────────────────────
say "Checking PostgreSQL $PG_CLUSTER_VERSION cluster"
if ! pg_lsclusters | grep -q "^$PG_CLUSTER_VERSION *$PG_CLUSTER_NAME .*online"; then
  echo "cluster not online — starting it"
  sudo pg_ctlcluster "$PG_CLUSTER_VERSION" "$PG_CLUSTER_NAME" start
  sleep 1
fi
pg_lsclusters | grep "^$PG_CLUSTER_VERSION *$PG_CLUSTER_NAME " || die "cluster still not listed after start"
echo "cluster online"

# ── 2. Fresh database (mirrors `supabase db reset`'s clean-slate guarantee) ─────────
say "Re-creating database '$DB'"
psql_super -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB' and pid <> pg_backend_pid();" >/dev/null
psql_super -d postgres -c "drop database if exists $DB;"
psql_super -d postgres -c "create database $DB owner postgres;"
# Real Supabase Postgres puts `extensions` on every session's default search_path (its own
# postgresql.conf, not something a migration sets) — supabase/seed.dev-auth.sql relies on that
# for unqualified crypt()/gen_salt() calls. Match it at the database level so every connection
# (bootstrap, migrations, seeds, pg_prove) gets it without each file having to qualify calls.
psql_super -d postgres -c "alter database $DB set search_path = \"\$user\", public, extensions;"

# ── 3. Supabase-compatibility bootstrap (roles, extensions, auth.* stub) ────────────
say "Applying bootstrap (roles / extensions / auth schema stub)"
psql_super -d "$DB" -f "$REPO/scripts/sandbox-pg-bootstrap.sql"

# ── 4. Migrations, in filename order (same order `supabase db reset` uses) ──────────
say "Applying supabase/migrations/*.sql"
shopt -s nullglob
migrations=("$REPO"/supabase/migrations/*.sql)
[ "${#migrations[@]}" -gt 0 ] || die "no migrations found under supabase/migrations/"
for f in "${migrations[@]}"; do
  echo "  -> $(basename "$f")"
  psql_super -d "$DB" -f "$f" >/tmp/sandbox-pg-last-migration.log 2>&1 || {
    echo "---- last 60 lines of output ----"
    tail -60 /tmp/sandbox-pg-last-migration.log
    die "migration failed: $(basename "$f") — fix the bootstrap shim, never the migration (per mission constraints)"
  }
done
echo "applied ${#migrations[@]} migrations"

# ── 5. Seeds, same order as supabase/config.toml's [db.seed] sql_paths ──────────────
if [ "$SEED" = "1" ]; then
  say "Applying seeds (seed.sql, seed.dev-tasks.sql, seed.dev-signals.sql, seed.dev-processes.sql, seed.dev-auth.sql)"
  for f in seed.sql seed.dev-tasks.sql seed.dev-signals.sql seed.dev-processes.sql seed.dev-auth.sql; do
    path="$REPO/supabase/$f"
    [ -f "$path" ] || die "expected seed file missing: $path"
    echo "  -> $f"
    psql_super -d "$DB" -f "$path" >/tmp/sandbox-pg-last-seed.log 2>&1 || {
      echo "---- last 60 lines of output ----"
      tail -60 /tmp/sandbox-pg-last-seed.log
      die "seed failed: $f"
    }
  done
else
  echo "skipping seeds (--no-seed)"
fi

say "READY"
cat <<EOF
Database:  $DB  (system PostgreSQL $PG_CLUSTER_VERSION, unix socket, role 'postgres')

Run the pgTAP calibration suite (equivalent of CI's \`supabase test db\`):

  sudo -u postgres pg_prove -U postgres -d $DB --host /var/run/postgresql \\
    --ext .sql supabase/tests/*.sql

Or a single file:

  sudo -u postgres pg_prove -U postgres -d $DB --host /var/run/postgresql \\
    --ext .sql supabase/tests/02_org_isolation.sql

Re-run this script any time to reset to a clean, freshly-migrated+seeded state.
This does NOT start GoTrue/PostgREST/a logged-in app — DB/pgTAP only (Priority 1).
EOF
