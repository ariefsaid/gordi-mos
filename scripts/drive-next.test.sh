#!/usr/bin/env bash
# Self-test for scripts/drive-next.sh — the drivable filter (blocked / assigned / parked labels /
# PRs / open-PR "Closes #N" cross-ref) and the milestone → ready-for-agent → number order,
# against a stubbed gh.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/drive-next.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

cat > "$tmp/issues.json" <<'EOF'
[
 {"number":1,"title":"built already","labels":[],"assignees":[],"milestone":null},
 {"number":2,"title":"blocked","labels":[],"assignees":[],"milestone":null,
  "issue_dependencies_summary":{"blocked_by":1}},
 {"number":3,"title":"claimed","labels":[],"assignees":[{"login":"x"}],"milestone":null},
 {"number":4,"title":"owner frontier","labels":[{"name":"wayfinder:grilling"}],"assignees":[],"milestone":null},
 {"number":5,"title":"milestone one","labels":[],"assignees":[],"milestone":{"number":1}},
 {"number":6,"title":"a PR","labels":[],"assignees":[],"milestone":null,"pull_request":{}},
 {"number":7,"title":"human only","labels":[{"name":"ready-for-human"}],"assignees":[],"milestone":null},
 {"number":8,"title":"agent ready","labels":[{"name":"ready-for-agent"}],"assignees":[],"milestone":null},
 {"number":9,"title":"plain old","labels":[],"assignees":[],"milestone":null}
]
EOF
cat > "$tmp/pulls.json" <<'EOF'
[
 {"number":90,"title":"feat: builds it","body":"does things\n\nCloses #1"},
 {"number":91,"title":"fix: decoys","body":"Fixes nothing here. Encloses #9 discussion. Fixes #8abc is not a ref. See owner/repo#5."}
]
EOF

mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<EOF
#!/usr/bin/env bash
# stub: answers the issues and pulls endpoints; two pages for issues (real --paginate shape)
[ "\$1" = api ] && [ "\$2" = --paginate ] || exit 9
[ "\${GH_STUB_FAIL:-0}" = 1 ] && exit 1
case "\$3" in
  *"/issues"*) jq '.[0:4]' < "$tmp/issues.json"; jq '.[4:]' < "$tmp/issues.json" ;;
  *"/pulls"*)  cat "$tmp/pulls.json" ;;
  *) exit 9 ;;
esac
EOF
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"

out="$(bash "$SCRIPT")"; rc=$?
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
      else fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "$out"; fi; }
[ "$rc" -eq 0 ]; t "query exits 0" $?
[ "$(printf '%s\n' "$out" | sed -n 1p)" = "$(printf '#5\tmilestone one\t')" ]; t "milestone ticket first" $?
[ "$(printf '%s\n' "$out" | sed -n 2p)" = "$(printf '#8\tagent ready\tready-for-agent')" ]; t "ready-for-agent before unlabeled" $?
[ "$(printf '%s\n' "$out" | sed -n 3p)" = "$(printf '#9\tplain old\t')" ]; t "plain ticket last" $?
! printf '%s' "$out" | grep -q "#1	"; t "issue with an open 'Closes #1' PR excluded" $?
[ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = "3" ]; t "blocked/claimed/parked/PR/human/built all excluded" $?

if GH_STUB_FAIL=1 bash "$SCRIPT" >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  gh failure must exit non-zero\n'
else pass=$((pass+1)); printf '  ok    gh failure exits non-zero (empty ≠ broken)\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
