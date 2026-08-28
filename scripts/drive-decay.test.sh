#!/usr/bin/env bash
# Self-test for scripts/drive-decay.sh — dead-claim aging, triage aging, frontier count,
# against a stubbed gh and a pinned NOW.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/drive-decay.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

cat > "$tmp/issues.json" <<'EOF'
[
 {"number":1,"title":"claimed, quiet 5d","labels":[],"assignees":[{"login":"x"}],
  "updated_at":"2026-08-23T00:00:00Z","created_at":"2026-08-01T00:00:00Z"},
 {"number":2,"title":"claimed, active today","labels":[],"assignees":[{"login":"x"}],
  "updated_at":"2026-08-28T00:00:00Z","created_at":"2026-08-01T00:00:00Z"},
 {"number":3,"title":"old triage","labels":[{"name":"needs-triage"}],"assignees":[],
  "updated_at":"2026-08-10T00:00:00Z","created_at":"2026-08-10T00:00:00Z"},
 {"number":4,"title":"fresh triage","labels":[{"name":"needs-triage"}],"assignees":[],
  "updated_at":"2026-08-27T00:00:00Z","created_at":"2026-08-27T00:00:00Z"},
 {"number":5,"title":"grill me","labels":[{"name":"wayfinder:grilling"}],"assignees":[],
  "updated_at":"2026-08-20T00:00:00Z","created_at":"2026-08-20T00:00:00Z"},
 {"number":7,"title":"grill me but blocked","labels":[{"name":"wayfinder:grilling"}],"assignees":[],
  "issue_dependencies_summary":{"blocked_by":1},
  "updated_at":"2026-08-20T00:00:00Z","created_at":"2026-08-20T00:00:00Z"},
 {"number":6,"title":"a PR","labels":[],"assignees":[{"login":"x"}],"pull_request":{},
  "updated_at":"2026-08-01T00:00:00Z","created_at":"2026-08-01T00:00:00Z"},
 {"number":8,"title":"ready but parked by PR 90","labels":[{"name":"ready-for-agent"}],"assignees":[],
  "updated_at":"2026-08-27T00:00:00Z","created_at":"2026-08-27T00:00:00Z"},
 {"number":9,"title":"ready and free","labels":[{"name":"ready-for-agent"}],"assignees":[],
  "updated_at":"2026-08-27T00:00:00Z","created_at":"2026-08-27T00:00:00Z"}
]
EOF

cat > "$tmp/pulls.json" <<'EOF2'
[{"number":90,"title":"wip","body":"touches #8 in passing"}]
EOF2
mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<EOF
#!/usr/bin/env bash
[ "\$1" = api ] && [ "\$2" = --paginate ] || exit 9
[ "\${GH_STUB_FAIL:-0}" = 1 ] && exit 1
case "\$3" in
  *"/pulls"*) cat "$tmp/pulls.json" ;;
  *) cat "$tmp/issues.json" ;;
esac
EOF
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"
export DRIVE_DECAY_NOW="2026-08-28T12:00:00Z"

out="$(bash "$SCRIPT")"; rc=$?
t() { # $1 name · $2 condition result (0 ok)
  if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "$out"; fi
}
[ "$rc" -eq 0 ]; t "exits 0 on good query" $?
printf '%s' "$out" | grep -q "DEAD-CLAIM	#1"; t "5d-quiet claim flagged" $?
! printf '%s' "$out" | grep -q "DEAD-CLAIM	#2"; t "active claim not flagged" $?
! printf '%s' "$out" | grep -q "#6"; t "PRs excluded" $?
printf '%s' "$out" | grep -q "AGING-TRIAGE	#3"; t "old triage flagged" $?
! printf '%s' "$out" | grep -q "AGING-TRIAGE	#4"; t "fresh triage not flagged" $?
printf '%s' "$out" | grep -q "FRONTIER	1 unblocked grilling"; t "frontier counts only unblocked (hook parity)" $?
printf '%s' "$out" | grep -q "UNTRACKED	#1"; t "state-less issue surfaces as UNTRACKED" $?
printf '%s' "$out" | grep -q "PR-PARKED	#8"; t "parked ready ticket surfaces (DD-WAY-45 counterweight)" $?
! printf '%s' "$out" | grep -q "PR-PARKED	#9"; t "unparked ready ticket not flagged" $?
! printf '%s' "$out" | grep -q "UNTRACKED	#3"; t "needs-triage issue is not UNTRACKED" $?

if GH_STUB_FAIL=1 bash "$SCRIPT" >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  gh failure must exit non-zero\n'
else pass=$((pass+1)); printf '  ok    gh failure exits non-zero\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
