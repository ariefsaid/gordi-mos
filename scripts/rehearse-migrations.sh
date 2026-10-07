#!/usr/bin/env bash
# Rehearse migrations on a restored copy of a database dump, in a throwaway local Postgres
# container with no network and no published port. deploy-staging.sh runs it before it pushes.
#
#   bash scripts/rehearse-migrations.sh <dump file | directory> <migrations dir> <migration file>...
#
# A directory means its newest *.dump by name (db-backup.sh stamps each name with UTC time).
# The image is $REHEARSAL_PG_IMAGE, else the image of the local Supabase stack's database.
# Roles live outside a database dump, so a role the restore names as missing is created
# (NOLOGIN) and the dump is restored again into a fresh database; that second restore must be clean.
# Each migration is applied in one transaction, stopping at the first error.
#
# Exit 0: every migration applied. 1: a migration failed. 2: the rehearsal could not run (no
# docker, dump or image, or the dump did not restore cleanly).
# Self-test: scripts/deploy-staging.test.sh (rehearsal section).
set -euo pipefail

say() { printf '%s\n' "$*"; }
setup_fail() { printf '✗ rehearsal: %s\n' "$1" >&2; exit 2; }

[ "$#" -ge 3 ] || setup_fail "usage: rehearse-migrations.sh <dump file | directory> <migrations dir> <migration file>..."
src="$1" mig_dir="$2"; shift 2
command -v docker >/dev/null 2>&1 || setup_fail "docker not found on PATH"

dump="$src"
if [ -d "$src" ]; then
  dump="$(find "$src" -maxdepth 1 -type f -name '*.dump' | sort | tail -1)"
  [ -n "$dump" ] || setup_fail "no *.dump file in the dump directory"
fi
[ -f "$dump" ] && [ -r "$dump" ] || setup_fail "dump file not readable"
[ -d "$mig_dir" ] || setup_fail "migrations directory not found"
for f in "$@"; do [ -f "$mig_dir/$f" ] || setup_fail "migration $f is not in the migrations directory"; done
dump="$(cd "$(dirname "$dump")" && pwd)/$(basename "$dump")"
mig_dir="$(cd "$mig_dir" && pwd)"

image="${REHEARSAL_PG_IMAGE:-}"
if [ -z "$image" ]; then
  image="$(docker ps --filter 'name=^supabase_db_' --format '{{.Image}}' | head -1)"
  [ -n "$image" ] || setup_fail "set REHEARSAL_PG_IMAGE, or start the local Supabase stack so its database image can be used"
fi

ctr="mos-rehearsal-$$-${RANDOM}"
pw="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() { docker rm -f "$ctr" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$ctr" --label mos.rehearsal=1 --network none \
  -e POSTGRES_PASSWORD="$pw" \
  -v "$dump:/rehearsal/source.dump:ro" -v "$mig_dir:/rehearsal/migrations:ro" \
  "$image" >/dev/null || setup_fail "could not start a throwaway container from $image"

# TCP to 127.0.0.1, so the entrypoint's socket-only init server does not count as ready.
user=""
for _ in $(seq 1 "${REHEARSAL_READY_SECONDS:-120}"); do
  for u in supabase_admin postgres; do
    if [ "$(docker exec -e PGPASSWORD="$pw" "$ctr" psql -U "$u" -h 127.0.0.1 -d postgres -XAtc \
          "select rolsuper from pg_roles where rolname = current_user" 2>/dev/null)" = t ]; then
      user="$u"; break 2
    fi
  done
  sleep 1
done
[ -n "$user" ] || setup_fail "the throwaway database did not become ready"

pg() { local tool="$1"; shift; docker exec -i -e PGPASSWORD="$pw" "$ctr" "$tool" -U "$user" -h 127.0.0.1 "$@"; }
restore() {
  pg psql -d postgres -X -q -v ON_ERROR_STOP=1 \
    -c 'set client_min_messages = warning' \
    -c 'drop database if exists rehearsal with (force)' -c 'create database rehearsal template template0' >/dev/null
  pg pg_restore -d rehearsal --no-password /rehearsal/source.dump 2>&1 || true
}

say "Rehearsal: restoring $(basename "$dump") into a throwaway $image container (no network)..."
out="$(restore)"
missing="$(grep -oE 'role "[^"]+" does not exist' <<< "$out" | sed -E 's/^role "([^"]+)".*/\1/' | sort -u || true)"
if [ -n "$missing" ]; then
  while IFS= read -r r; do
    printf 'create role :"r" nologin;\n' | pg psql -d postgres -X -q -v ON_ERROR_STOP=1 -v r="$r" >/dev/null
  done <<< "$missing"
  say "Rehearsal: created $(wc -l <<< "$missing" | tr -d ' ') role(s) the dump refers to; restoring again..."
  out="$(restore)"
fi
if grep -q 'error:' <<< "$out"; then
  grep 'error:' <<< "$out" | head -20 >&2
  setup_fail "the dump did not restore cleanly, so a rehearsal on it would prove nothing"
fi

for f in "$@"; do
  if ! err="$(pg psql -d rehearsal -X -q -1 -v ON_ERROR_STOP=1 -f "/rehearsal/migrations/$f" 2>&1 >/dev/null)"; then
    printf '%s\n' "$err" | grep -v 'WARNING:' | head -20 >&2
    printf '✗ rehearsal: %s failed on the restored copy\n' "$f" >&2
    exit 1
  fi
  say "Rehearsal: applied $f"
done
say "Rehearsal ok: ${#} migration(s) applied to the restored copy."
