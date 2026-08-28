#!/usr/bin/env bash
# Assemble the mechanical half of a milestone-review package: what dev ships that main doesn't.
# The /release skill adds the human half (rendered screenshots, the ratification ask).
#
#   scripts/release-evidence.sh [base] [head]     (defaults origin/main origin/dev)
#
# Markdown to stdout: shipped issues (from squash-merge subjects), the full commit list,
# a diffstat summary, and the migration files in the window (they gate the staging push).
# Fail closed: unresolvable refs or an empty window refuse — a release with no content is a
# mistake, not a package. Self-test: scripts/release-evidence.test.sh
set -uo pipefail

base="${1:-origin/main}"
head="${2:-origin/dev}"
for r in "$base" "$head"; do
  git rev-parse --verify --quiet "$r^{commit}" >/dev/null \
    || { echo "✗ release-evidence: ref '$r' does not resolve" >&2; exit 1; }
done

count="$(git rev-list --count "$base".."$head")"
[ "$count" -gt 0 ] || { echo "✗ release-evidence: $base..$head is empty — nothing to release" >&2; exit 1; }

echo "## Release evidence: $head over $base ($count commits)"
echo
echo "### Shipped (issue refs in the window's subjects)"
subjects="$(git log "$base".."$head" --pretty='%s')"
printf '%s\n' "$subjects" | grep -oE '#[0-9]+' | tr -d '#' | sed 's/^0*//;s/^$/0/' | sort -nu \
  | while read -r n; do
      subj="$(printf '%s\n' "$subjects" | grep -E "#0*$n([^0-9]|$)" | head -1)"
      echo "- #$n — $subj"
    done
echo
echo "### All commits"
git log "$base".."$head" --pretty='- %h %s'
echo
echo "### Change shape"
git diff --stat "$base".."$head" | tail -1
echo
echo "### Migrations in this window (gate the staging \`supabase db push\`)"
migs="$(git diff --name-only "$base".."$head" -- 'supabase/migrations/*' || true)"
if [ -n "$migs" ]; then printf '%s\n' "$migs" | sed 's/^/- /'; else echo "- none"; fi
