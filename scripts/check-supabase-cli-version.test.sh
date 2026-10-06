#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

mkdir -p "$tmp/repo/.github/workflows" "$tmp/repo/scripts/lib" "$tmp/repo/supabase"
cp scripts/check-supabase-cli-version.sh "$tmp/repo/scripts/"
cat > "$tmp/repo/supabase/CLI_VERSION" <<'EOF'
2.104.0
EOF
cat > "$tmp/repo/.github/workflows/db.yml" <<'EOF'
steps:
  - uses: supabase/setup-cli@v3
    with:
      version: 2.104.0
EOF
cat > "$tmp/repo/scripts/cloud-setup.sh" <<'EOF'
SUPABASE_VERSION="$(tr -d '[:space:]' < "$REPO/supabase/CLI_VERSION")"
EOF
cat > "$tmp/repo/scripts/lib/cloud-tools.sh" <<'EOF'
2.104.0:amd64)
2.104.0:arm64)
EOF
run() { REPO_ROOT="$tmp/repo" bash "$tmp/repo/scripts/check-supabase-cli-version.sh" >/dev/null 2>&1; }

if run; then ok "matching workflow and script pins pass"; else bad "matching workflow and script pins pass"; fi
sed -i.bak 's/version: 2.104.0/version: 2.105.0/' "$tmp/repo/.github/workflows/db.yml"
if ! run; then ok "workflow version drift fails"; else bad "workflow version drift fails"; fi
mv "$tmp/repo/.github/workflows/db.yml.bak" "$tmp/repo/.github/workflows/db.yml"
sed -i.bak 's/2.104.0:arm64)/2.105.0:arm64)/' "$tmp/repo/scripts/lib/cloud-tools.sh"
if ! run; then ok "script checksum pin drift fails"; else bad "script checksum pin drift fails"; fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
