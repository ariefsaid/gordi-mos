#!/usr/bin/env bash
# Record a locally auditable, commit-specific owner assent for the merge guard to check.
# The caller quotes the owner's words, matching ci-e2e.sh's --owner-ok honesty model; this guards
# habit drift rather than trying to authenticate a hostile operator.
# Usage: scripts/owner-assent.sh <sha> "<owner's quoted words>"
# Self-test: scripts/owner-assent.test.sh
set -uo pipefail

[ "$#" -eq 2 ] || { printf "✗ owner-assent: usage: scripts/owner-assent.sh <sha> \"<owner's quoted words>\"\n" >&2; exit 2; }
sha="$1"
words="$2"
[[ "$words" =~ [^[:space:]] ]] || { printf '✗ owner-assent: quoted words must not be empty or whitespace-only\n' >&2; exit 1; }

head="$(git rev-parse --verify --quiet --end-of-options "${sha}^{commit}")" \
  || { printf '✗ owner-assent: SHA does not resolve to a commit: %s\n' "$sha" >&2; exit 1; }
[[ "$head" =~ ^[[:xdigit:]]{40}$ ]] \
  || { printf '✗ owner-assent: resolved commit SHA is not a full 40-character SHA\n' >&2; exit 1; }
common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  || { printf '✗ owner-assent: not inside a git checkout\n' >&2; exit 1; }
[ -n "$common_dir" ] || { printf '✗ owner-assent: could not locate the git common directory\n' >&2; exit 1; }

# Keep the record one physical line, as in ci-e2e.sh's owner-ok log entry.
words="$(printf '%s' "$words" | tr '\t\r\n' '   ')"
marker="$common_dir/owner-assent-$head"
printf '%s %s %s\n' "$head" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$words" > "$marker" \
  || { printf '✗ owner-assent: could not write marker: %s\n' "$marker" >&2; exit 1; }
printf '✓ owner assent recorded: %s\n' "$marker"
