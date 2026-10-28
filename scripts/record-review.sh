#!/usr/bin/env bash
# Stamp HEAD as independently reviewed, one lens at a time. gh-post.sh refuses `pr create` into dev
# without a security stamp when the diff touches sensitive paths, and refuses PRs into main/staging
# without the release stamps. Review is machine-first; looks are judged on rendered screens at
# hand-back, never here.
#
#   scripts/record-review.sh --lens security --reviewer openai-codex/gpt-6-luna --artifact docs/reviews/feat-x.md [--base main|staging]
#
# Rules:
#   - reviewer: an agent that did not write the branch — glm / luna / gpt-6.1-terra (cross-family), Claude opus or gpt-6.1-sol fallback.
#   - the artifact is the reviewer's actual output: each lens must cite the full 40-character HEAD,
#     carry a `Reviewer:` line, and carry a Verdict for THIS lens. DO NOT MERGE clears only that
#     lens's passing stamp; it cannot be stamped into a passing gate.
#
# Self-test: scripts/record-review.test.sh
set -uo pipefail

die() { printf '✗ record-review: %s\n' "$1" >&2; exit 1; }

is_release_candidate() {
  local base="${1:-}"
  case "$base" in main|staging) return 0 ;; esac
  case "$(git branch --show-current)" in release/*) return 0 ;; esac
  git rev-parse -q --verify origin/main >/dev/null \
    && git merge-base --is-ancestor HEAD origin/main
}

lens="" reviewer="" artifact="" base="" base_seen=0 release=0
while [ $# -gt 0 ]; do
  case "$1" in
    --lens) lens="${2:-}"; shift 2 ;;
    --reviewer) reviewer="${2:-}"; shift 2 ;;
    --artifact) artifact="${2:-}"; shift 2 ;;
    --base)
      [ $# -ge 2 ] || die "--base needs a branch name"
      [ -n "$2" ] || die "--base needs a non-empty branch name"
      [ "$base_seen" = 0 ] || [ "$base" = "$2" ] || die "conflicting --base values were given"
      base="$2"; base_seen=1; shift 2 ;;
    --base=*)
      candidate="${1#--base=}"
      [ -n "$candidate" ] || die "--base needs a non-empty branch name"
      [ "$base_seen" = 0 ] || [ "$base" = "$candidate" ] || die "conflicting --base values were given"
      base="$candidate"; base_seen=1; shift ;;
    *) die "unknown arg: $1 (usage: --lens <spec|code-quality|security> --reviewer <name> --artifact <file> [--base <branch>])" ;;
  esac
done
[ -n "$lens" ] && [ -n "$reviewer" ] && [ -n "$artifact" ] \
  || die "usage: --lens <spec|code-quality|security> --reviewer <name> --artifact <file>"
case "$artifact" in *[[:space:]]*) die "artifact path must not contain whitespace" ;; esac
if [ "$base_seen" = 1 ]; then
  case "$base" in main|staging) ;; *) die "--base must be main or staging (got '$base')" ;; esac
fi

case "$lens" in spec|code-quality|security) ;; *) die "unknown lens '$lens' (spec|code-quality|security)" ;; esac

case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
  *glm*|*luna*|*gpt-6.1-terra*|*opus*|*gpt-6.1-sol*) ;;
  *) die "reviewer '$reviewer' is not an accepted independent reviewer (glm/luna/gpt-6.1-terra, or a Claude opus or gpt-6.1-sol fallback)" ;;
esac

[ -s "$artifact" ] || die "artifact missing or empty: $artifact"
head="$(git rev-parse HEAD)" || die "not a git repo"

# Release candidates need an Opus or Sol security lens; migration branches accept Opus, Sol, or an exact-prefix
# Luna or Terra id. A release candidate is on release/*, targets main/staging, or is already contained in
# origin/main. A migration branch touches supabase/migrations/.
if [ "$lens" = security ]; then
  is_release_candidate "$base" && release=1
  migration="$(git diff --name-only origin/dev...HEAD -- supabase/migrations 2>/dev/null | head -1)"
  if [ "$release" = 1 ]; then
    case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
      opus*|claude-opus*|anthropic/claude-opus*|gpt-6.1-sol*|openai-codex/gpt-6.1-sol*) ;;
      *) die "this is a release candidate — its security lens needs an Opus or Sol reviewer (id starting opus / claude-opus / gpt-6.1-sol / openai-codex/gpt-6.1-sol; got '$reviewer'); dispatch one and stamp with --reviewer <that id>" ;;
    esac
  elif [ -n "$migration" ]; then
    case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
      opus*|claude-opus*|anthropic/claude-opus*|gpt-6.1-sol*|openai-codex/gpt-6.1-sol*|gpt-6-luna*|openai-codex/gpt-6-luna*|luna*|gpt-6.1-terra*|openai-codex/gpt-6.1-terra*) ;;
      *) die "this is a migration branch — its security lens needs an Opus, Sol, Luna or Terra reviewer (Opus id starting opus / claude-opus; Sol id starting gpt-6.1-sol / openai-codex/gpt-6.1-sol; Luna id starting gpt-6-luna / openai-codex/gpt-6-luna / luna; Terra id starting gpt-6.1-terra / openai-codex/gpt-6.1-terra; got '$reviewer'); dispatch one and stamp with --reviewer <that id>" ;;
    esac
  fi
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
printf '%s\n' "$section" | grep -qE "^Commit:[[:space:]]+$head[[:space:]]*$" \
  || die "the '$lens' section must cite full 40-character HEAD $head on its Commit: line"
printf '%s\n' "$section" | grep -qi '^Reviewer:' \
  || die "the '$lens' section has no 'Reviewer:' line — it must be the reviewer's own record"
sec_model="$(printf '%s\n' "$section" | grep -i '^Reviewer:' | head -1 \
  | sed -E 's/^[Rr]eviewer:[[:space:]]*//; s/[[:space:]]*\([^)]*\)[[:space:]]*$//')"
[ "$sec_model" = "$reviewer" ] \
  || die "the '$lens' section's Reviewer is '$sec_model', not '$reviewer' — exact match required (substring spoofs refuse)"
verdict_lines="$(printf '%s\n' "$section" | grep -iE '^Verdict:' || true)"
[ -n "$verdict_lines" ] || die "the '$lens' section carries no 'Verdict:' line"

if printf '%s\n' "$verdict_lines" | grep -q 'DO NOT MERGE'; then
  gitdir="$(git rev-parse --git-dir)" || die "not a git repo"
  rm -f "$gitdir/independent-review-$lens-ok" \
    || die "could not clear the '$lens' lens stamp after DO NOT MERGE"
  if [ "$lens" = security ]; then
    rm -f "$gitdir/independent-review-security-release-ok" \
      || die "could not clear the security release-rule stamp after DO NOT MERGE"
  fi
  die "the '$lens' lens verdict is DO NOT MERGE; its stamp was cleared (other lens stamps are unchanged)"
fi

verdict_count="$(printf '%s\n' "$verdict_lines" | awk 'END { print NR }')"
[ "$verdict_count" -eq 1 ] \
  || die "the '$lens' section must carry exactly one 'Verdict:' line (found $verdict_count)"

verdict="$(printf '%s\n' "$verdict_lines" | sed -E 's/^[Vv]erdict:[[:space:]]*//' | head -1)"
printf '%s\n' "$verdict" | grep -qE '^MERGE( WITH CHANGES)?$' \
  || die "the '$lens' section's verdict is not machine-readable (MERGE | MERGE WITH CHANGES): '$verdict'"

gitdir="$(git rev-parse --git-dir)"
stamp="$head $lens $reviewer $(date -u +%Y-%m-%dT%H:%M:%SZ) $artifact"
if [ "$lens" = security ]; then
  rm -f "$gitdir/independent-review-security-release-ok" \
    || die "could not clear the previous security release-rule stamp"
fi
printf '%s\n' "$stamp" > "$gitdir/independent-review-$lens-ok" \
  || die "could not write the '$lens' lens stamp"
if [ "$lens" = security ] && [ "$release" = 1 ]; then
  printf '%s\n' "$head" > "$gitdir/independent-review-security-release-ok" \
    || die "could not write the security release-rule stamp"
fi
echo "✓ $lens lens stamped ${head:0:8} by $reviewer ($artifact)"
