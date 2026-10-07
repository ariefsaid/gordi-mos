#!/usr/bin/env bash
# Rehearse migrations on a restored copy of a database dump, in a throwaway local Postgres
# container with no network and no published port. deploy-staging.sh runs it before it pushes.
#
#   bash scripts/rehearse-migrations.sh <dump file | directory> <migrations dir> <migration file>...
#
# A directory means its newest *.dump by name (db-backup.sh stamps each name with UTC time).
# The image is $REHEARSAL_PG_IMAGE, else the image of the local Supabase stack's database.
# Cloud-only platform owners and event triggers are omitted from the archive TOC. Roles referenced
# by project grants are created (NOLOGIN) and the filtered dump is restored again into a fresh database.
# Each migration is applied in one transaction, stopping at the first error.
#
# Exit 0: every migration applied. 1: a migration failed. 2: the rehearsal could not run (no
# docker, dump or image, or the dump did not restore cleanly).
# Self-test: scripts/rehearse-migrations.test.sh.
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

toc_dir="$(mktemp -d -t mos-rehearsal-toc.XXXXXX)"
chmod 755 "$toc_dir"
toc="$toc_dir/archive.list" filtered="$toc_dir/filtered.list"
present="$toc_dir/present-roles" owners="$toc_dir/owners" missing_roles="$toc_dir/missing-roles" skipped="$toc_dir/skipped"
: > "$toc"; : > "$filtered"; : > "$present"; : > "$owners"; : > "$missing_roles"; : > "$skipped"
chmod 644 "$toc" "$filtered" "$present" "$owners" "$missing_roles" "$skipped"

ctr="mos-rehearsal-$$-${RANDOM}"
pw="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() { docker rm -f "$ctr" >/dev/null 2>&1 || true; rm -rf "$toc_dir"; }
trap cleanup EXIT

docker run -d --rm --name "$ctr" --label mos.rehearsal=1 --network none \
  -e POSTGRES_PASSWORD="$pw" \
  -v "$dump:/rehearsal/source.dump:ro" -v "$mig_dir:/rehearsal/migrations:ro" \
  -v "$toc_dir:/rehearsal/toc:ro" \
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
if ! pg pg_restore -l /rehearsal/source.dump > "$toc" 2>/dev/null; then
  setup_fail "could not list the dump contents"
fi
# Global roles are absent from database dumps; derive cloud-only owners by comparing the TOC to pg_roles.
pg psql -d postgres -X -At -v ON_ERROR_STOP=1 -c 'select rolname from pg_roles' > "$present"
awk '!/^;/ && /^[[:space:]]*[0-9]+;/ && NF > 1 && $NF != "-" { print $NF }' "$toc" | sort -u > "$owners"
while IFS= read -r role; do
  [ -n "$role" ] || continue
  grep -Fxq -- "$role" "$present" || printf '%s\n' "$role" >> "$missing_roles"
done < "$owners"
awk -v skipped_file="$skipped" '
  FILENAME == ARGV[1] { if ($0 != "") missing[$0] = 1; next }
  {
    if ($0 ~ /^;/ || $0 !~ /^[[:space:]]*[0-9]+;/) { print; next }
    skip = ($4 == "EVENT" && $5 == "TRIGGER") || ($NF != "-" && ($NF in missing))
    if (skip) {
      label = ""
      for (i = 4; i < NF; i++) label = label (label == "" ? "" : " ") $i
      if (label != "") print label >> skipped_file
      next
    }
    print
  }
' "$missing_roles" "$toc" > "$filtered"
chmod 644 "$filtered" "$skipped"
skipped_count="$(wc -l < "$skipped" | tr -d '[:space:]')"
skipped_names=""
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  skipped_names="${skipped_names:+$skipped_names; }$entry"
done < "$skipped"
if [ "$skipped_count" -gt 0 ]; then
  say "Rehearsal: skipped $skipped_count platform-owned TOC entries: $skipped_names"
else
  say "Rehearsal: skipped 0 platform-owned TOC entries."
fi

restore() {
  pg psql -d postgres -X -q -v ON_ERROR_STOP=1 \
    -c 'set client_min_messages = warning' \
    -c 'drop database if exists rehearsal with (force)' -c 'create database rehearsal template template0' >/dev/null
  pg pg_restore -d rehearsal --no-password -L /rehearsal/toc/filtered.list /rehearsal/source.dump 2>&1 || true
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
