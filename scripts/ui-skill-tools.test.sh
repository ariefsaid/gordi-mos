#!/usr/bin/env bash
# Hermetic contract for resolving UI skills from a linked worktree.
set -euo pipefail

source_root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/project"
linked="$tmp/linked"
git init -q "$repo"
git -C "$repo" config user.name 'UI skill self-test'
git -C "$repo" config user.email 'ui-skill-test@example.invalid'
mkdir -p "$repo/scripts" "$repo/docs/takeover" \
  "$repo/.claude/skills/impeccable/scripts" "$repo/.claude/skills/impeccable/reference" \
  "$repo/.claude/skills/taste" "$repo/.claude/skills/ui-ux-pro-max/templates/base" \
  "$repo/.claude/skills/ui-ux-pro-max/scripts"
cp "$source_root/scripts/ui-skill-tools.sh" "$repo/scripts/"
for file in \
  docs/takeover/mvp-ui-continuation.md \
  .claude/skills/impeccable/SKILL.md \
  .claude/skills/impeccable/reference/operate.md \
  .claude/skills/impeccable/reference/critique.md \
  .claude/skills/impeccable/reference/audit.md \
  .claude/skills/impeccable/reference/craft-floor.md \
  .claude/skills/taste/SKILL.md \
  .claude/skills/ui-ux-pro-max/SKILL.md \
  .claude/skills/ui-ux-pro-max/templates/base/quick-reference.md; do
  printf 'fixture\n' > "$repo/$file"
done
cat > "$repo/.claude/skills/impeccable/scripts/impeccable" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_CALLS"
case "${1:-}" in
  engine-probe) printf 'impeccable-engine 0.1.5\n' ;;
  context) printf 'context loaded\n' ;;
  *) exit 7 ;;
esac
MOCK
chmod +x "$repo/.claude/skills/impeccable/scripts/impeccable"
cat > "$repo/.claude/skills/ui-ux-pro-max/scripts/search.py" <<'MOCK'
import sys
print('search ' + ' '.join(sys.argv[1:]))
MOCK
git -C "$repo" add .
git -C "$repo" commit -qm 'fixture'
git -C "$repo" worktree add -q -b linked "$linked"
export MOCK_CALLS="$tmp/launcher-calls"

(cd "$linked" && bash scripts/ui-skill-tools.sh paths) > "$tmp/paths"
grep -Fq "$repo/docs/takeover/mvp-ui-continuation.md" "$tmp/paths"
grep -Fq "$repo/.claude/skills/impeccable/reference/critique.md" "$tmp/paths"
(cd "$linked" && bash scripts/ui-skill-tools.sh check) > "$tmp/check"
grep -Fq 'No review has run.' "$tmp/check"
(cd "$linked" && bash scripts/ui-skill-tools.sh impeccable context --target example.tsx) > "$tmp/context"
grep -Fq 'context loaded' "$tmp/context"
(cd "$linked" && bash scripts/ui-skill-tools.sh ux-search actions) > "$tmp/search"
grep -Fq 'search actions' "$tmp/search"

set +e
(cd "$linked" && bash scripts/ui-skill-tools.sh impeccable critique --help) > "$tmp/critique-out" 2> "$tmp/critique-err"
rc=$?
set -e
test "$rc" -eq 2
grep -Fq 'AI-harness playbook' "$tmp/critique-err"
if grep -Fq 'critique' "$MOCK_CALLS"; then
  echo 'The playbook was incorrectly passed to the CLI launcher' >&2
  exit 1
fi

rm "$repo/.claude/skills/impeccable/reference/audit.md"
set +e
(cd "$linked" && bash scripts/ui-skill-tools.sh check) > "$tmp/missing-out" 2> "$tmp/missing-err"
rc=$?
set -e
test "$rc" -eq 1
grep -Fq 'Missing UI review dependency' "$tmp/missing-err"

printf 'UI skill resolver: worktree, utility, playbook refusal and missing dependency pass\n'
