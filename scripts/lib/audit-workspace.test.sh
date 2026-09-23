#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT/scripts/lib/audit-workspace.sh"

work="$(mktemp -d -t mos-audit-workspace.XXXXXX)"
trap 'rm -rf "$work"' EXIT

main="$work/main"
linked="$work/linked"
git init -q "$main"
git -C "$main" config user.email test@example.com
git -C "$main" config user.name Test
touch "$main/README.md"
git -C "$main" add README.md
git -C "$main" commit -qm init
git -C "$main" worktree add -q -b audit-test "$linked"

mkdir -p "$main/mos-app"
cat > "$main/mos-app/.env.e2e" <<'EOF'
# Values can contain equals signs and must never be evaluated as shell.
VITE_SUPABASE_URL=http://127.0.0.1:44321
VITE_SUPABASE_ANON_KEY=header.payload=signature
SUPABASE_SERVICE_ROLE_KEY=service-role-value
EOF

primary="$(audit_primary_workspace_root "$linked")"
main_real="$(cd "$main" && pwd -P)"
test "$primary" = "$main_real" || {
  echo "primary workspace mismatch: $primary" >&2
  exit 1
}

fixture_env="$(audit_fixture_env_file "$linked" "$primary")"
test "$fixture_env" = "$main_real/mos-app/.env.e2e" || {
  echo "fixture env mismatch: $fixture_env" >&2
  exit 1
}

anon="$(audit_env_value "$fixture_env" VITE_SUPABASE_ANON_KEY)"
test "$anon" = 'header.payload=signature' || {
  echo "env parser changed a literal value" >&2
  exit 1
}

audit_candidate_worktree_clean "$linked" || {
  echo "clean candidate worktree was refused" >&2
  exit 1
}
touch "$linked/untracked.ts"
if audit_candidate_worktree_clean "$linked"; then
  echo "untracked candidate source was accepted" >&2
  exit 1
fi
rm "$linked/untracked.ts"
printf 'changed\n' >> "$linked/README.md"
if audit_candidate_worktree_clean "$linked"; then
  echo "modified candidate source was accepted" >&2
  exit 1
fi
git -C "$linked" checkout -q -- README.md

override="$work/override.env"
printf 'VITE_SUPABASE_URL=http://127.0.0.1:54321\n' > "$override"
export AUDIT_FIXTURE_ENV_FILE="$override"
fixture_env="$(audit_fixture_env_file "$linked" "$primary")"
test "$fixture_env" = "$override" || {
  echo "explicit fixture env was ignored" >&2
  exit 1
}

echo "audit workspace tests passed"
