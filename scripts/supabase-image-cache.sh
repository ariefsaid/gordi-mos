#!/usr/bin/env bash
# Save/load the images of the services started by the pinned Supabase CLI.
set -euo pipefail

if [ "$#" -ne 1 ] || [[ "$1" != load && "$1" != save ]]; then
  echo "Usage: $0 load|save" >&2
  exit 2
fi

archive=/tmp/supabase-images.tar
if [ "$1" = load ]; then
  docker load --input "$archive"
  echo "Loaded cached Supabase images from $archive"
  exit 0
fi

project_id="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' supabase/config.toml | head -1)"
if [ -z "$project_id" ]; then
  echo "Could not read project_id from supabase/config.toml" >&2
  exit 1
fi

containers="$(docker ps -aq --filter "label=com.supabase.cli.project=$project_id")"
if [ -z "$containers" ]; then
  echo "No Supabase containers found for project $project_id" >&2
  exit 1
fi

mapfile -t images < <(docker inspect --format '{{.Image}}' $containers | sort -u)
if [ "${#images[@]}" -eq 0 ]; then
  echo "No Supabase container images found for project $project_id" >&2
  exit 1
fi

docker save --output "$archive" "${images[@]}"
echo "Saved ${#images[@]} Supabase images to $archive"
