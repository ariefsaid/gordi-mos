#!/usr/bin/env bash

audit_primary_workspace_root() {
  local checkout="$1"
  local common_dir
  common_dir="$(git -C "$checkout" rev-parse --path-format=absolute --git-common-dir)" || return 1
  (cd "$(dirname "$common_dir")" && pwd -P)
}

audit_fixture_env_file() {
  local checkout="$1"
  local primary="$2"
  if [ -n "${AUDIT_FIXTURE_ENV_FILE:-}" ]; then
    printf '%s\n' "$AUDIT_FIXTURE_ENV_FILE"
  elif [ -f "$checkout/mos-app/.env.e2e" ]; then
    printf '%s\n' "$checkout/mos-app/.env.e2e"
  else
    printf '%s\n' "$primary/mos-app/.env.e2e"
  fi
}

audit_env_value() {
  local source_file="$1"
  local name="$2"
  python3 - "$source_file" "$name" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
name = sys.argv[2]
for line in source.read_text().splitlines():
    trimmed = line.strip()
    if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
        continue
    key, value = trimmed.split("=", 1)
    if key.strip() == name:
        sys.stdout.write(value.strip())
        break
PY
}

audit_candidate_worktree_clean() {
  local checkout="$1"
  local status
  status="$(git -C "$checkout" status --porcelain --untracked-files=normal)" || return 1
  [ -z "$status" ]
}
