#!/usr/bin/env bash
# Run locally after changing role skills or vendoring to confirm a security reviewer can produce a live verdict.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/pi-role-canary.sh <role>" >&2
  exit 2
fi

root=$(cd "$(dirname "$0")/.." && pwd -P)
role="$1"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/pi-role-canary.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/brief.md" <<'EOF'
Provide a security verdict on commit aa02ec8c in this repository. Read the relevant code and tests directly. End with a line in exactly this form: Verdict: MERGE, Verdict: MERGE WITH CHANGES, or Verdict: DO NOT MERGE.
EOF

if (cd "$root" && bash scripts/pi-role.sh "$role" "$tmp/brief.md") >"$tmp/output" 2>&1; then
  role_status=0
else
  role_status=$?
fi
cat "$tmp/output"

if [ "$role_status" -ne 0 ]; then
  echo "pi-role-canary: role exited with status $role_status" >&2
  exit 1
fi
if grep -Eiq 'not assessed|launcher' "$tmp/output"; then
  echo "pi-role-canary: output indicates the review was not assessed or a launcher prerequisite failed" >&2
  exit 1
fi
if ! grep -Eq '^Verdict: (MERGE|MERGE WITH CHANGES|DO NOT MERGE)' "$tmp/output"; then
  echo "pi-role-canary: output has no recognized verdict line" >&2
  exit 1
fi

echo "PASS pi-role-canary: $role produced a live verdict"
