#!/usr/bin/env bash
# Stamp HEAD as independently reviewed, ONE LENS AT A TIME. gh-post.sh refuses `pr create`
# without all three lens stamps (spec · code-quality · security) — OD-WAY-83: the merge gate is
# three explicit lens records, separately produced and machine-validated; one reviewer may
# perform all three, but each record is its own stamping.
#
#   scripts/record-review.sh --lens security --reviewer gpt-5.6-luna --artifact docs/reviews/feat-x.md
#
# Rules:
#   - reviewer: an agent that did not write the branch — glm / luna (cross-family), opus fallback.
#   - the artifact is the reviewer's actual output: it must cite this HEAD (≥12-char prefix),
#     carry a `Reviewer:` line, and carry a Verdict for THIS lens that is MERGE or
#     MERGE WITH CHANGES — a DO NOT MERGE cannot be stamped into a passing gate.
#
# Self-test: scripts/record-review.test.sh
set -uo pipefail

die() { printf '✗ record-review: %s\n' "$1" >&2; exit 1; }

lens="" reviewer="" artifact=""
while [ $# -gt 0 ]; do
  case "$1" in
    --lens) lens="${2:-}"; shift 2 ;;
    --reviewer) reviewer="${2:-}"; shift 2 ;;
    --artifact) artifact="${2:-}"; shift 2 ;;
    *) die "unknown arg: $1 (usage: --lens <spec|code-quality|security> --reviewer <name> --artifact <file>)" ;;
  esac
done
[ -n "$lens" ] && [ -n "$reviewer" ] && [ -n "$artifact" ] \
  || die "usage: --lens <spec|code-quality|security> --reviewer <name> --artifact <file>"

case "$lens" in spec|code-quality|security) ;; *) die "unknown lens '$lens' (spec|code-quality|security)" ;; esac

case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
  *glm*|*luna*|*opus*) ;;
  *) die "reviewer '$reviewer' is not an accepted independent reviewer (glm/luna, or opus fallback)" ;;
esac

[ -s "$artifact" ] || die "artifact missing or empty: $artifact"

head="$(git rev-parse HEAD)" || die "not a git repo"
grep -q "${head:0:12}" "$artifact" || die "artifact does not cite HEAD ${head:0:12} — the review must be OF this commit"

# Any refusal anywhere in the artifact poisons every stamp from it — conservative on purpose.
if grep -iE '^Verdict:' "$artifact" | grep -q "DO NOT MERGE"; then
  die "artifact carries a DO NOT MERGE — fix and re-review; a refusal cannot be stamped into a passing gate"
fi

# SECTION-BOUND validation: the stamp is minted from THIS lens's own record, never from another
# lens's verdict sharing the file. A section opens at a 'Reviewer:' line or '## ' heading naming
# the lens, and closes at the next section opener.
# Exact tags only: a '## <lens>' heading (whole line) or a parenthesized '(<lens>)' on the
# Reviewer line — substring matches ('## special' for spec) must NOT open a section.
section="$(awk -v lens="$lens" '
  /^## /          { open = ($0 == "## " lens) }
  /^[Rr]eviewer:/ { open = (index($0, "(" lens ")") > 0) }
  open { print }
' "$artifact")"
[ -n "$section" ] || die "artifact has no section for lens '$lens' (a 'Reviewer: … ($lens)' line or '## $lens' heading) — each lens is its own record (OD-WAY-83)"
printf '%s\n' "$section" | grep -qi '^Reviewer:' \
  || die "the '$lens' section has no 'Reviewer:' line — it must be the reviewer's own record"
verdict="$(printf '%s\n' "$section" | grep -iE '^Verdict:' | sed -E 's/^[Vv]erdict:[[:space:]]*//' | head -1)"
[ -n "$verdict" ] || die "the '$lens' section carries no 'Verdict:' line"
printf '%s\n' "$verdict" | grep -qE '^MERGE( WITH CHANGES)?$' \
  || die "the '$lens' section's verdict is not machine-readable (MERGE | MERGE WITH CHANGES): '$verdict'"

gitdir="$(git rev-parse --git-dir)"
printf '%s %s %s %s %s\n' "$head" "$lens" "$reviewer" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$artifact" \
  > "$gitdir/independent-review-$lens-ok"
echo "✓ $lens lens stamped ${head:0:8} by $reviewer ($artifact)"
