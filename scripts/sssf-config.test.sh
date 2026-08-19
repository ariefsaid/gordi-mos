#!/usr/bin/env bash
# Self-test for the MOS factory roster config (#336) — FR-007's explicit-pin rule
# and the substrate ruling, machine-decidable only. Every agent pins model:
# explicitly from the allowed substrate set; banned substrates absent; contracts
# under agents/; protected_files cover the gate/config/contracts/scripts/CI; the
# two-places header names the sibling record. Proves itself able to fail by
# re-running the same checks against perturbed fixtures.
set -uo pipefail
cd "$(dirname "$0")/.."
CONFIG="adws/adw_sssf_config/sssf.config.yaml"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# check_config <file> [<git_helper.py>] — prints nothing, returns nonzero with
# reasons on stdout on violation.
check_config() {
  local cfg="$1" gh="${2:-adws/adw_modules/git_helper.py}" bad_out=""
  # 1. every roster slot pins model: explicitly (FR-007 — no defaults inheritance)
  local names models
  names=$(grep -c '^  - name: ' "$cfg")
  models=$(awk '/^  - name: /{n++; m=0} /^    model: /{m=1; k++} END{print k}' "$cfg")
  [ "$names" -eq "$models" ] || bad_out+="only $models of $names agents pin model: explicitly\n"
  # 2. allowed substrates only — a whitelist on every model: line, so any banned
  #    provider (openrouter, fireworks, upstream's google default, …) is caught here
  while read -r m; do
    case "$m" in
      zai/glm-5.3|zai/glm-4.7|openai-codex/gpt-5.6-terra|openai-codex/gpt-5.6-luna) ;;
      *) bad_out+="model not in the ruled substrate set: $m\n" ;;
    esac
  done < <(grep -E '^ *model: ' "$cfg" | awk '{print $2}')
  # 3. contract paths live under agents/
  while read -r c; do
    case "$c" in agents/*.md) ;; *) bad_out+="contract outside agents/: $c\n" ;; esac
  done < <(grep -E '^ *contract: ' "$cfg" | awk '{print $2}')
  # 4. protected_files cover the uneditable-by-roster set (NFR-002)
  local p
  for p in adws/adw_modules/ adws/adw_sssf_config/ 'adws/adw_*.py' agents/ scripts/ .github/ .githooks/; do
    grep -qF -- "- $p" "$cfg" || bad_out+="protected_files missing: $p\n"
  done
  # 5. two-places rule names the sibling record
  grep -q 'docs/agents/pi-delegation.md' "$cfg" || bad_out+="header does not name docs/agents/pi-delegation.md\n"
  # 6. every roster model has an attribution row in git_helper (#343) — a commit
  #    must be able to name the model that built it, so a substrate ruling that
  #    adds a model here must add its trailer mapping there too
  while read -r m; do
    grep -qF "\"$m\":" "$gh" || bad_out+="model with no attribution trailer row in git_helper: $m\n"
  done < <(grep -E '^ *model: ' "$cfg" | awk '{print $2}' | sort -u)
  [ -z "$bad_out" ] || { printf '%b' "$bad_out"; return 1; }
}

if OUT=$(check_config "$CONFIG"); then
  ok "roster config passes all substrate/pin/protection checks"
else
  bad "roster config violates the ruled shape:"
  printf '%s\n' "$OUT" | sed 's/^/        /'
fi

# ── prove the checker can fail: perturbed fixtures must each go red ──────────
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

sed 's|model: zai/glm-5.3|model: openrouter/free-model|' "$CONFIG" > "$tmp/banned.yaml"
check_config "$tmp/banned.yaml" >/dev/null && bad "checker missed a banned substrate" \
  || ok "checker catches a banned substrate"

awk 'BEGIN{done=0} {if (!done && /^    model: /) {done=1; next} print}' "$CONFIG" > "$tmp/unpinned.yaml"
check_config "$tmp/unpinned.yaml" >/dev/null && bad "checker missed an unpinned agent" \
  || ok "checker catches an agent without an explicit model pin"

sed 's|- agents/ |- dropped/ |' "$CONFIG" > "$tmp/unprot.yaml"
check_config "$tmp/unprot.yaml" >/dev/null && bad "checker missed dropped protected_files entry" \
  || ok "checker catches a dropped protected_files entry"

sed 's|contract: agents/|contract: elsewhere/|' "$CONFIG" > "$tmp/contract.yaml"
check_config "$tmp/contract.yaml" >/dev/null && bad "checker missed an out-of-tree contract path" \
  || ok "checker catches a contract path outside agents/"

grep -v '"zai/glm-5.3":' adws/adw_modules/git_helper.py > "$tmp/gh-unmapped.py"
check_config "$CONFIG" "$tmp/gh-unmapped.py" >/dev/null \
  && bad "checker missed a roster model with no attribution trailer row (#343)" \
  || ok "checker catches a roster model with no attribution trailer row (#343)"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
