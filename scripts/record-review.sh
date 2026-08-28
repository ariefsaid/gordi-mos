#!/usr/bin/env bash
# Stamp HEAD as independently reviewed. gh-post.sh refuses `pr create` without this stamp.
#
#   scripts/record-review.sh --reviewer gpt-5.6-luna --artifact docs/reviews/feat-x.md
#
# Rules (docs/decisions.md 2026-08-27, amends the #295 identity direction):
#   - reviewer must be an agent that did not write the branch: cross-family preferred
#     (glm / luna), opus accepted as fallback. The session's own model never qualifies.
#   - the artifact is the reviewer's actual output and must cite this HEAD (≥12-char sha prefix),
#     so a stamp cannot be minted from a stale or unrelated review.
#
# Self-test: scripts/record-review.test.sh
set -uo pipefail

die() { printf '✗ record-review: %s\n' "$1" >&2; exit 1; }

reviewer="" artifact=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reviewer) reviewer="${2:-}"; shift 2 ;;
    --artifact) artifact="${2:-}"; shift 2 ;;
    *) die "unknown arg: $1 (usage: --reviewer <name> --artifact <file>)" ;;
  esac
done
[ -n "$reviewer" ] && [ -n "$artifact" ] || die "usage: --reviewer <name> --artifact <file>"

case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
  *glm*|*luna*|*opus*) ;;
  *) die "reviewer '$reviewer' is not an accepted independent reviewer (glm/luna, or opus fallback)" ;;
esac

[ -s "$artifact" ] || die "artifact missing or empty: $artifact"

head="$(git rev-parse HEAD)" || die "not a git repo"
grep -q "${head:0:12}" "$artifact" || die "artifact does not cite HEAD ${head:0:12} — the review must be OF this commit (re-review, or fix the Commit: line)"

gitdir="$(git rev-parse --git-dir)"
printf '%s %s %s %s\n' "$head" "$reviewer" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$artifact" > "$gitdir/independent-review-ok"
echo "✓ independent-review stamped ${head:0:8} by $reviewer ($artifact)"
