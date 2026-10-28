#!/usr/bin/env bash
# Retry only transient image-pull rate limits; fail immediately for every other start error.
set -uo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <supabase-start-exclusions>" >&2
  exit 2
fi

log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

for attempt in 1 2 3; do
  : > "$log_file"
  set +e
  supabase start -x "$1" 2>&1 | tee "$log_file"
  status=${PIPESTATUS[0]}
  set -e
  if [ "$status" -eq 0 ]; then
    exit 0
  fi

  terminal_line="$(sed '/^[[:space:]]*$/d' "$log_file" | tail -n 1)"
  if ! grep -Eiq '((pull|image).*(toomanyrequests|too many requests|429|retry-after)|(toomanyrequests|too many requests|429|retry-after).*(pull|image))' <<<"$terminal_line"; then
    exit "$status"
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "Supabase image pull rate limit persisted after 3 attempts" >&2
    exit "$status"
  fi
  delay=$((10 * (2 ** (attempt - 1))))
  echo "Transient Supabase image pull rate limit; retrying in ${delay}s (attempt $((attempt + 1))/3)" >&2
  sleep "$delay"
done
