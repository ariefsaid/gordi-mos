#!/usr/bin/env bash
# Save/load the images of the services started by the pinned Supabase CLI.
set -euo pipefail

if [ "$#" -ne 1 ] || [[ "$1" != load && "$1" != pull && "$1" != save ]]; then
  echo "Usage: $0 load|pull|save" >&2
  exit 2
fi

archive=/tmp/supabase-images.tar
if [ "$1" = load ]; then
  docker load --input "$archive"
  echo "Loaded cached Supabase images from $archive"
  exit 0
fi

if [ "$1" = pull ]; then
  # Supabase CLI 2.104.0's core services used by CI. Pulling these images seeds
  # the same archive without starting any containers; update when the CLI pin changes.
  images=(
    public.ecr.aws/supabase/postgres:17.6.1.132
    public.ecr.aws/supabase/gotrue:v2.189.0
    public.ecr.aws/supabase/postgrest:v14.12
    public.ecr.aws/supabase/kong:2.8.1
    public.ecr.aws/supabase/mailpit:v1.22.3
  )
  for image in "${images[@]}"; do
    docker pull "$image"
  done
  docker save --output "$archive" "${images[@]}"
  echo "Pulled and saved ${#images[@]} Supabase images to $archive"
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
