#!/usr/bin/env bash
# Self-test for scripts/drive-next.sh — the drivable filter (blocked / assigned / parked labels /
# PRs) and the milestone-then-number order, against a stubbed gh.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/drive-next.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

cat > "$tmp/issues.json" <<'EOF'
[
 {"number":1,"title":"plain unblocked","labels":[],"assignees":[],"milestone":null},
 {"number":2,"title":"blocked","labels":[],"assignees":[],"milestone":null,
  "issue_dependencies_summary":{"blocked_by":1}},
 {"number":3,"title":"claimed","labels":[],"assignees":[{"login":"x"}],"milestone":null},
 {"number":4,"title":"owner frontier","labels":[{"name":"wayfinder:grilling"}],"assignees":[],"milestone":null},
 {"number":5,"title":"milestone one","labels":[{"name":"ready-for-agent"}],"assignees":[],
  "milestone":{"number":1}},
 {"number":6,"title":"a PR","labels":[],"assignees":[],"milestone":null,"pull_request":{}},
 {"number":7,"title":"human only","labels":[{"name":"ready-for-human"}],"assignees":[],"milestone":null}
]
EOF

mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<EOF
#!/usr/bin/env bash
# stub: 'gh api <path> --jq <prog>' → run the real jq program over the fixture
[ "\$1" = api ] || exit 9
[ "\${GH_STUB_FAIL:-0}" = 1 ] && exit 1
jq -r "\$4" < "$tmp/issues.json"
EOF
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"

out="$(bash "$SCRIPT")"; rc=$?
want_first='#5	milestone one	ready-for-agent'
want_second='#1	plain unblocked	'
if [ "$rc" -eq 0 ]; then pass=$((pass+1)); printf '  ok    query exits 0\n'; else fail=$((fail+1)); printf '  FAIL  rc=%s\n' "$rc"; fi
if [ "$(printf '%s\n' "$out" | sed -n 1p)" = "$want_first" ]; then
  pass=$((pass+1)); printf '  ok    milestone ticket sorts first\n'
else fail=$((fail+1)); printf '  FAIL  line1: %s\n' "$(printf '%s\n' "$out" | sed -n 1p)"; fi
if [ "$(printf '%s\n' "$out" | sed -n 2p)" = "$want_second" ]; then
  pass=$((pass+1)); printf '  ok    null-milestone ticket second\n'
else fail=$((fail+1)); printf '  FAIL  line2: %s\n' "$(printf '%s\n' "$out" | sed -n 2p)"; fi
if [ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = "2" ]; then
  pass=$((pass+1)); printf '  ok    blocked/claimed/parked/PR/human all excluded\n'
else fail=$((fail+1)); printf '  FAIL  extra lines:\n%s\n' "$out"; fi

if GH_STUB_FAIL=1 bash "$SCRIPT" >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  gh failure must exit non-zero\n'
else pass=$((pass+1)); printf '  ok    gh failure exits non-zero (empty ≠ broken)\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
