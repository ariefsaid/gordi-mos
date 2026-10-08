#!/usr/bin/env bash
# Stamp HEAD as independently reviewed, ONE LENS AT A TIME. gh-post.sh refuses `pr create`
# without all three lens stamps (spec · code-quality · security) — OD-WAY-83: the merge gate is
# three explicit lens records, separately produced and machine-validated; one reviewer may
# perform all three, but each record is its own stamping.
#
#   scripts/record-review.sh --lens security --reviewer gpt-5.6-luna --artifact docs/reviews/feat-x.md [--base main|staging]
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
  local base="${1:-}"
  case "$base" in main|staging) return 0 ;; esac
  case "$(git branch --show-current)" in release/*) return 0 ;; esac
  git rev-parse -q --verify origin/main >/dev/null \
    && git merge-base --is-ancestor HEAD origin/main
}

design_pass_reason() {
  local merge_base="$1" changed_files="$2" release_base="${3:-}" path added deleted lines=0 numstat route_diff
  if is_release_candidate "$release_base"; then
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

owner_reported_ui_reason() {
  local merge_base="$1" changed_files="$2" path branch subjects issue label_json owner_issue="" issue_ids="" ui_file=0

  while IFS= read -r path; do
    # Any app .tsx/.css counts here: an owner-reported fix in a shared stylesheet can break a
    # sibling page as easily as a page edit.
    [[ "$path" =~ ^mos-app/src/.+\.(tsx|css)$ ]] || continue
    [[ "$path" == *.test.tsx ]] && continue
    ui_file=1
    break
  done <<< "$changed_files"
  [ "$ui_file" -eq 1 ] || return 1

  branch="$(git branch --show-current)" || return 2
  if [[ "$branch" =~ ^[^/]+/([0-9]+)(-.+)?$ ]]; then
    issue_ids="${BASH_REMATCH[1]}"
  fi
  subjects="$(git log --no-merges --format=%s "$merge_base..HEAD" 2>/dev/null)" || return 2
  while IFS= read -r issue; do
    [ -n "$issue" ] || continue
    issue="${issue#\#}"
    case " $issue_ids " in *" $issue "*) ;; *) issue_ids="${issue_ids:+$issue_ids }$issue" ;; esac
  done < <(printf '%s\n' "$subjects" | grep -oE '#[0-9]+' || true)
  [ -n "$issue_ids" ] || return 1
  command -v jq >/dev/null 2>&1 || {
    printf '✗ record-review: cannot read labels for linked issue #%s while checking rule (d); retry when GitHub is reachable\n' "${issue_ids%% *}" >&2
    return 2
  }

  for issue in $issue_ids; do
    label_json="$(gh issue view "$issue" --json labels 2>/dev/null)" || {
      printf '✗ record-review: cannot read labels for issue #%s while checking rule (d); retry when GitHub is reachable\n' "$issue" >&2
      return 2
    }
    if ! printf '%s\n' "$label_json" | jq -e '(.labels | type == "array") and all(.labels[]; (.name | type == "string"))' >/dev/null 2>&1; then
      printf '✗ record-review: cannot read labels for issue #%s while checking rule (d); retry when GitHub is reachable\n' "$issue" >&2
      return 2
    fi
    if printf '%s\n' "$label_json" | jq -e '[.labels[].name] | any(. == "owner-reported")' >/dev/null 2>&1; then
      [ -n "$owner_issue" ] || owner_issue="$issue"
    fi
  done

  [ -n "$owner_issue" ] || return 1
  printf 'fixes owner-reported issue #%s' "$owner_issue"
}

validate_ui_skills_evidence() {
  local head="$1" artifact="$2" reason="$3" section main_checkout playbook row_rc evidence_path evidence_file
  local evidence_commit changed_files changed_path test_only candidate
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
    if ! grep -Eq "(^|[^[:xdigit:]])${head}([^[:xdigit:]]|$)" "$evidence_file"; then
      evidence_commit=""
      while IFS= read -r candidate; do
        grep -Eq "(^|[^[:xdigit:]])${candidate}([^[:xdigit:]]|$)" "$evidence_file" \
          || continue
        git cat-file -e "$candidate^{commit}" 2>/dev/null \
          && git merge-base --is-ancestor "$candidate" "$head" 2>/dev/null \
          || continue
        changed_files="$(git diff --name-only "$candidate" "$head")" || continue
        test_only=1
        while IFS= read -r changed_path; do
          [ -n "$changed_path" ] || continue
          case "$changed_path" in
            *.test.ts|*.test.tsx|*.spec.ts|mos-app/e2e/*|supabase/tests/*) ;;
            *) test_only=0; break ;;
          esac
        done <<< "$changed_files"
        if [ "$test_only" -eq 1 ]; then
          evidence_commit="$candidate"
          break
        fi
      done < <(grep -Eo '[[:xdigit:]]{40}' "$evidence_file" | sort -u)
      [ -n "$evidence_commit" ] \
        || die "Skills evidence file for '$playbook' does not cite exact full 40-character HEAD $head: $evidence_path"
    fi
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

validate_issue_skills_evidence() {
  local artifact="$1" issue="${MOS_ISSUE:-}" issue_line issue_body plan_output plan_rc main_checkout docs_real path candidate_dir in_docs missing_list
  local -a missing_files=()
  if [ -z "$issue" ]; then
    issue_line="$(grep -m1 -E '^Issue:[[:space:]]*#[0-9]+[[:space:]]*$' "$artifact" || true)"
    [ -n "$issue_line" ] || return 0
    issue="$(printf '%s\n' "$issue_line" | sed -E 's/^Issue:[[:space:]]*#([0-9]+)[[:space:]]*$/\1/')"
  fi
  [[ "$issue" =~ ^[0-9]+$ ]] || die "MOS_ISSUE must be a numeric issue number (got '$issue')"
  issue_body="$(gh issue view "$issue" --json body -q .body 2>/dev/null)" \
    || die "cannot read body for issue #$issue while checking Skills plan evidence; retry when GitHub is reachable"
  grep -qxE '^## Skills plan[[:space:]]*$' <<< "$issue_body" || return 0

  plan_output="$(printf '%s' "$issue_body" | bash "$(dirname "$0")/skills-plan.sh" evidence - 2>&1)"; plan_rc=$?
  [ "$plan_rc" -eq 0 ] || die "issue #$issue has an invalid Skills plan
$plan_output"

  main_checkout="$(git worktree list --porcelain 2>/dev/null \
    | awk '$1 == "worktree" { sub(/^worktree /, ""); print; exit }')"
  [ -n "$main_checkout" ] || die "cannot find the main checkout for issue #$issue Skills plan evidence"
  docs_real="$(cd "$main_checkout/docs" 2>/dev/null && pwd -P)" || docs_real=""
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    candidate_dir="$(cd "$(dirname "$main_checkout/$path")" 2>/dev/null && pwd -P)" || candidate_dir=""
    in_docs=0
    if [ -n "$docs_real" ] && [ -n "$candidate_dir" ]; then
      case "$candidate_dir/" in "$docs_real/"*) in_docs=1 ;; esac
    fi
    if [ ! -f "$main_checkout/$path" ] || [ ! -s "$main_checkout/$path" ] \
      || [ -L "$main_checkout/$path" ] || [ "$in_docs" -eq 0 ]; then
      missing_files+=("$path")
    fi
  done <<< "$plan_output"
  [ "${#missing_files[@]}" -eq 0 ] || {
    missing_list="$(printf '  - %s\n' "${missing_files[@]}")"
    die "issue #$issue Skills plan evidence is missing or empty; evidence lives in the main checkout's docs/:
$missing_list
write each file, or correct the plan's path"
  }
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
  *glm*|*luna*|*opus*) ;;
  *) die "reviewer '$reviewer' is not an accepted independent reviewer (glm/luna, or opus fallback)" ;;
esac

[ -s "$artifact" ] || die "artifact missing or empty: $artifact"
validate_issue_skills_evidence "$artifact"

head="$(git rev-parse HEAD)" || die "not a git repo"

# Release candidates need an Opus security lens; migration branches accept Opus or an exact-prefix
# Luna id. A release candidate is on release/*, targets main/staging, or is already contained in
# origin/main. A migration branch touches supabase/migrations/.
if [ "$lens" = security ]; then
  is_release_candidate "$base" && release=1
  migration="$(git diff --name-only origin/dev...HEAD -- supabase/migrations 2>/dev/null | head -1)"
  if [ "$release" = 1 ]; then
    case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
      opus*|claude-opus*|anthropic/claude-opus*) ;;
      *) die "this is a release candidate — its security lens needs an Opus reviewer (id starting opus / claude-opus; got '$reviewer'); dispatch one and stamp with --reviewer <that id>" ;;
    esac
  elif [ -n "$migration" ]; then
    case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
      opus*|claude-opus*|anthropic/claude-opus*|gpt-6-luna*|openai-codex/gpt-6-luna*|luna*) ;;
      *) die "this is a migration branch — its security lens needs an Opus or Luna reviewer (Opus id starting opus / claude-opus; Luna id starting gpt-6-luna / openai-codex/gpt-6-luna / luna; got '$reviewer'); dispatch one and stamp with --reviewer <that id>" ;;
    esac
  fi
fi

merge_base="$(git merge-base origin/dev HEAD 2>/dev/null)" \
  || die "cannot compare HEAD with origin/dev to determine whether this is a UI diff"
changed_files="$(git diff --name-only --diff-filter=d "$merge_base" HEAD 2>/dev/null)" \
  || die "could not list the diff from origin/dev's merge-base"
design_reason="$(design_pass_reason "$merge_base" "$changed_files" "$base")"
design_reason_rc=$?
[ "$design_reason_rc" -le 1 ] || die "could not determine whether this diff needs a design pass"
if [ "$design_reason_rc" -eq 1 ]; then
  design_reason="$(owner_reported_ui_reason "$merge_base" "$changed_files")"
  design_reason_rc=$?
  [ "$design_reason_rc" -ne 2 ] || exit 1
fi
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
