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
#   - the artifact is the reviewer's actual output: each lens must cite the full 40-character HEAD,
#     carry a `Reviewer:` line, and carry a Verdict for THIS lens. DO NOT MERGE clears only that
#     lens's passing stamp; it cannot be stamped into a passing gate.
#   - A design-pass UI Skills packet is required for release candidates and qualifying UI changes.
#
# Self-test: scripts/record-review.test.sh
set -uo pipefail

die() { printf '✗ record-review: %s\n' "$1" >&2; exit 1; }

is_release_candidate() {
  case "$(git branch --show-current)" in release/*|"") return 0 ;; esac
  for b in origin/dev origin/main; do
    git rev-parse -q --verify "$b" >/dev/null \
      && git merge-base --is-ancestor HEAD "$b" && return 0
  done
  return 1
}

design_pass_reason() {
  local merge_base="$1" changed_files="$2" path added deleted lines=0 numstat route_diff
  if is_release_candidate; then
    printf 'release candidate'
    return 0
  fi

  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if [[ "$path" == mos-app/src/pages/* ]] && [[ "$path" != *.test.tsx ]] \
      && ! git cat-file -e "$merge_base:$path" 2>/dev/null; then
      printf 'adds a page (%s)' "$path"
      return 0
    fi
  done <<< "$changed_files"

  if printf '%s\n' "$changed_files" | grep -Fxq 'mos-app/src/router.tsx'; then
    route_diff="$(git diff --unified=0 "$merge_base" HEAD -- mos-app/src/router.tsx)" || return 2
    if printf '%s\n' "$route_diff" | grep -Eq '^\+[^+]*path[[:space:]]*:'; then
      printf 'adds a route (mos-app/src/router.tsx)'
      return 0
    fi
  fi

  while IFS= read -r path; do
    [ -n "$path" ] || continue
    git cat-file -e "$merge_base:$path" 2>/dev/null && continue
    if [[ "$path" =~ ^mos-app/src/(components|shell)/.+\.tsx$ ]] && [[ "$path" != *.test.tsx ]]; then
      printf 'adds a component (%s)' "$path"
      return 0
    fi
    if [[ "$path" =~ ^mos-app/src/.+\.css$ ]]; then
      printf 'adds a stylesheet (%s)' "$path"
      return 0
    fi
  done <<< "$changed_files"

  numstat="$(git diff --numstat --diff-filter=d "$merge_base" HEAD)" || return 2
  while IFS=$'\t' read -r added deleted path; do
    [[ "$path" =~ ^mos-app/src/(pages|components|shell)/.+\.(tsx|css)$ ]] || continue
    [[ "$path" == *.test.tsx ]] && continue
    case "$added$deleted" in *[!0-9]*|'') continue ;; esac
    lines=$((lines + added + deleted))
  done <<< "$numstat"
  if [ "$lines" -gt 150 ]; then
    printf 'changes %s lines of page/component/shell UI' "$lines"
    return 0
  fi
  return 1
}

validate_ui_skills_evidence() {
  local head="$1" artifact="$2" reason="$3" section main_checkout playbook row_rc evidence_path evidence_file
  local render_found=0 phone_found=0 tablet_found=0 wide_found=0 real_length_found=0 complete_render=0 line
  local -a playbooks=('Impeccable shape' 'ui-ux-pro-max' 'Impeccable critique' 'Impeccable layout' 'Impeccable clarify' 'Impeccable harden' 'Impeccable polish' 'Taste')

  grep -qxE '^## Skills evidence[[:space:]]*$' "$artifact" \
    || die "design pass required: $reason; UI diff requires a '## Skills evidence' section in the review artifact"
  section="$(awk '
    /^## Skills evidence[[:space:]]*$/ { inside = 1; next }
    inside && /^##[[:space:]]/ { exit }
    inside { print }
  ' "$artifact")"
  main_checkout="$(git worktree list --porcelain | awk '$1=="worktree"{print $2; exit}')"
  [ -n "$main_checkout" ] || die "cannot find the main checkout for Skills evidence paths"

  for playbook in "${playbooks[@]}"; do
    evidence_path="$(printf '%s\n' "$section" | awk -F'|' -v required="$playbook" '
      /^\|/ {
        name = $2
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
        if (name == required) {
          count++
          evidence = $3
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", evidence)
          if (substr(evidence, 1, 1) == "`" && substr(evidence, length(evidence), 1) == "`")
            evidence = substr(evidence, 2, length(evidence) - 2)
        }
      }
      END { if (count == 1) print evidence; else exit (count == 0 ? 2 : 3) }
    ' 2>/dev/null)"
    row_rc=$?
    [ "$row_rc" -eq 0 ] || {
      [ "$row_rc" -eq 2 ] && die "Skills evidence is missing required row: $playbook"
      die "Skills evidence must contain exactly one row for: $playbook"
    }
    [ -n "$evidence_path" ] || die "Skills evidence row '$playbook' has no evidence file path"
    if [[ "$evidence_path" = /* ]]; then evidence_file="$evidence_path"
    else evidence_file="$main_checkout/docs/$evidence_path"
    fi
    [ -f "$evidence_file" ] || die "Skills evidence file for '$playbook' does not exist: $evidence_path (resolved to $evidence_file)"
    grep -Eq "(^|[^[:xdigit:]])${head}([^[:xdigit:]]|$)" "$evidence_file" \
      || die "Skills evidence file for '$playbook' does not cite exact full 40-character HEAD $head: $evidence_path"
  done

  while IFS= read -r line; do
    printf '%s\n' "$line" | grep -qi 'render' || continue
    render_found=1
    printf '%s\n' "$line" | grep -Eq '(^|[^0-9])390([^0-9]|$)' && phone_found=1
    printf '%s\n' "$line" | grep -Eq '(^|[^0-9])768([^0-9]|$)' && tablet_found=1
    printf '%s\n' "$line" | awk '
      {
        text = $0
        while (match(text, /(^|[^[:alnum:]])[0-9][0-9][0-9][0-9]+/)) {
          width = substr(text, RSTART, RLENGTH)
          sub(/^[^0-9]+/, "", width)
          if (width + 0 >= 1440) found = 1
          text = substr(text, RSTART + RLENGTH)
        }
      }
      END { exit !found }
    ' && wide_found=1
    printf '%s\n' "$line" | grep -Fq 'real-length' && real_length_found=1
    if printf '%s\n' "$line" | grep -Eq '(^|[^0-9])390([^0-9]|$)' \
      && printf '%s\n' "$line" | grep -Eq '(^|[^0-9])768([^0-9]|$)' \
      && printf '%s\n' "$line" | awk '
        {
          text = $0
          while (match(text, /(^|[^[:alnum:]])[0-9][0-9][0-9][0-9]+/)) {
            width = substr(text, RSTART, RLENGTH)
            sub(/^[^0-9]+/, "", width)
            if (width + 0 >= 1440) found = 1
            text = substr(text, RSTART + RLENGTH)
          }
        }
        END { exit !found }
      ' && printf '%s\n' "$line" | grep -Fq 'real-length'; then
      complete_render=1
    fi
  done <<< "$section"
  [ "$render_found" -eq 1 ] || die "Skills evidence is missing a render-evidence row/line"
  [ "$phone_found" -eq 1 ] || die "render evidence is missing width 390"
  [ "$tablet_found" -eq 1 ] || die "render evidence is missing width 768"
  [ "$wide_found" -eq 1 ] || die "render evidence is missing a 1440-or-wider width"
  [ "$real_length_found" -eq 1 ] || die "render evidence is missing the text 'real-length'"
  [ "$complete_render" -eq 1 ] \
    || die "one render-evidence row/line must list widths 390, 768, and 1440-or-wider plus 'real-length'"
}

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

# Releases and migrations get an Opus security lens. The shared release-candidate predicate covers
# release/* branches, detached HEADs, and HEADs already contained in origin/dev or origin/main; a
# migration branch touches anything under supabase/migrations/.
if [ "$lens" = security ]; then
  release=0
  is_release_candidate && release=1
  migration="$(git diff --name-only origin/dev...HEAD -- supabase/migrations 2>/dev/null | head -1)"
  if [ "$release" = 1 ] || [ -n "$migration" ]; then
    case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
      opus*|claude-opus*|anthropic/claude-opus*) ;;
      *) die "this is a $([ "$release" = 1 ] && echo release candidate || echo migration branch) — its security lens needs an Opus reviewer (id starting opus / claude-opus; got '$reviewer'); dispatch one and stamp with --reviewer <that id>" ;;
    esac
  fi
fi

merge_base="$(git merge-base origin/dev HEAD 2>/dev/null)" \
  || die "cannot compare HEAD with origin/dev to determine whether this is a UI diff"
changed_files="$(git diff --name-only --diff-filter=d "$merge_base" HEAD 2>/dev/null)" \
  || die "could not list the diff from origin/dev's merge-base"
# (d) Owner-reported UI issue labels are not available to this script yet.
design_reason="$(design_pass_reason "$merge_base" "$changed_files")"
design_reason_rc=$?
[ "$design_reason_rc" -le 1 ] || die "could not determine whether this diff needs a design pass"
if [ "$design_reason_rc" -eq 0 ]; then
  validate_ui_skills_evidence "$head" "$artifact" "$design_reason"
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
  die "the '$lens' lens verdict is DO NOT MERGE; its stamp was cleared (other lens stamps are unchanged)"
fi

verdict_count="$(printf '%s\n' "$verdict_lines" | awk 'END { print NR }')"
[ "$verdict_count" -eq 1 ] \
  || die "the '$lens' section must carry exactly one 'Verdict:' line (found $verdict_count)"

verdict="$(printf '%s\n' "$verdict_lines" | sed -E 's/^[Vv]erdict:[[:space:]]*//' | head -1)"
printf '%s\n' "$verdict" | grep -qE '^MERGE( WITH CHANGES)?$' \
  || die "the '$lens' section's verdict is not machine-readable (MERGE | MERGE WITH CHANGES): '$verdict'"

gitdir="$(git rev-parse --git-dir)"
printf '%s %s %s %s %s\n' "$head" "$lens" "$reviewer" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$artifact" \
  > "$gitdir/independent-review-$lens-ok"
echo "✓ $lens lens stamped ${head:0:8} by $reviewer ($artifact)"
