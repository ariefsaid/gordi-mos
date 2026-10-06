#!/usr/bin/env bash
set -euo pipefail
ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
version_file="$ROOT/supabase/CLI_VERSION"
[ -r "$version_file" ] || { echo "missing supabase/CLI_VERSION" >&2; exit 1; }
version="$(tr -d '[:space:]' < "$version_file")"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid supabase/CLI_VERSION" >&2; exit 1; }

pins=0
for workflow in "$ROOT"/.github/workflows/*.yml; do
  [ -f "$workflow" ] || continue
  while IFS= read -r actual; do
    [ -n "$actual" ] || continue
    pins=$((pins + 1))
    [ "$actual" = "$version" ] || {
      echo "$workflow pins Supabase CLI $actual; expected $version" >&2
      exit 1
    }
  done < <(awk '
    /^[[:space:]]*(-[[:space:]]*)?uses:[[:space:]]*supabase\/setup-cli@/ { action=1; next }
    /^[[:space:]]*-[[:space:]]*name:/ { action=0; with_block=0 }
    /^[[:space:]]*(-[[:space:]]*)?uses:/ { action=0; with_block=0 }
    action && /^[[:space:]]*with:[[:space:]]*$/ { with_block=1; next }
    action && with_block && /^[[:space:]]*version:[[:space:]]*/ {
      sub(/^[[:space:]]*version:[[:space:]]*/, "")
      print
      with_block=0
    }
  ' "$workflow")
done
[ "$pins" -gt 0 ] || { echo "no Supabase CLI workflow pins found" >&2; exit 1; }

grep -Eq '^SUPABASE_VERSION=.*supabase/CLI_VERSION' "$ROOT/scripts/cloud-setup.sh" || {
  echo "cloud-setup.sh must read supabase/CLI_VERSION" >&2
  exit 1
}
for arch in amd64 arm64; do
  grep -Fq "$version:$arch)" "$ROOT/scripts/lib/cloud-tools.sh" || {
    echo "cloud-tools.sh has no checksum pin for $version ($arch)" >&2
    exit 1
  }
done
printf 'Supabase CLI pins match %s (%s workflows)\n' "$version" "$pins"
