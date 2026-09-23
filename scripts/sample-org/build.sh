#!/usr/bin/env bash
# Build the sample-org payload from a THROWAWAY database that `supabase db reset` has seeded with
# the committed dev seeds — never from a database holding real data (refused below).
# Usage: SAMPLE_PSQL='…' SAMPLE_PGDUMP='pg_dump "$URL"' build.sh <out.sql>
set -euo pipefail
out="${1:?usage: build.sh <out.sql>}"
: "${SAMPLE_PSQL:?}" "${SAMPLE_PGDUMP:?}"
here="$(cd "$(dirname "$0")" && pwd)"
real=$(eval "$SAMPLE_PSQL -qAt" <<<"select count(*) from shared.people where coalesce(email,'') not like '%@example.test'")
[ "$real" = 0 ] || { echo "build refused: the source holds $real non-fixture person row(s)" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
eval "$SAMPLE_PGDUMP --data-only --column-inserts -n shared -n mos -n ops -n integrations -n reporting -T shared.activities -T shared.role_capabilities" > "$tmp/app.sql"
eval "$SAMPLE_PGDUMP --data-only --column-inserts -t auth.users -t auth.identities" > "$tmp/auth.sql"
python3 "$here/remap.py" "$tmp/app.sql" "$tmp/auth.sql" > "$out"
echo "built $out ($(grep -c '^INSERT' "$out") rows)"
