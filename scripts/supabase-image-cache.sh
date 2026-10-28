#!/usr/bin/env bash
# Save/load the images of the services started by the pinned Supabase CLI.
set -euo pipefail

if [ "$#" -ne 1 ] || [[ "$1" != load && "$1" != save ]]; then
  echo "Usage: $0 load|save" >&2
  exit 2
fi

archive=/tmp/supabase-images.tar
if [ "$1" = load ]; then
  load_output="$(docker load --input "$archive")"
  printf '%s\n' "$load_output"
  loaded_refs=()
  while IFS= read -r image_ref; do
    loaded_refs+=("$image_ref")
  done < <(sed -n 's/^Loaded image: //p' <<<"$load_output" | sort -u)
  if [ "${#loaded_refs[@]}" -eq 0 ]; then
    echo "No tagged Supabase image references found in $archive load output" >&2
    exit 1
  fi
  for image_ref in "${loaded_refs[@]}"; do
    if ! docker image inspect "$image_ref" >/dev/null; then
      echo "Loaded Supabase image reference is missing: $image_ref" >&2
      exit 1
    fi
    echo "Verified cached Supabase image: $image_ref"
  done
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

images=()
while IFS= read -r image_ref; do
  images+=("$image_ref")
done < <(docker inspect --format '{{.Config.Image}}' $containers | sort -u)
if [ "${#images[@]}" -eq 0 ]; then
  echo "No Supabase container images found for project $project_id" >&2
  exit 1
fi

docker save --output "$archive" "${images[@]}"
for image_ref in "${images[@]}"; do
  if ! docker image inspect "$image_ref" >/dev/null; then
    echo "Saved Supabase image reference cannot be resolved: $image_ref" >&2
    exit 1
  fi
done
echo "Saved ${#images[@]} tagged Supabase images to $archive"
