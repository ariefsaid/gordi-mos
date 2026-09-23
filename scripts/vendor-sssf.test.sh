#!/usr/bin/env bash
# Self-test for the sssf stanza in scripts/vendor-skills.sh — FAC-001 (#334).
# Proves the stamped factory skeleton is byte-identical to upstream
# disler/super-simple-software-factory at the recorded pin, except the files
# listed in adws/PORT-MANIFEST.md. Network: one shallow fetch of the pin.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

PIN="$(sed -n 's/^SSSF_PIN="\([0-9a-f]\{40\}\)"$/\1/p' scripts/vendor-skills.sh)"
if [ -z "$PIN" ]; then
  bad "SSSF_PIN not found in scripts/vendor-skills.sh"
  printf '%d passed, %d failed\n' "$pass" "$fail"; exit 1
fi
ok "pin recorded in vendor-skills.sh: $PIN"

grep -qF "$PIN" adws/PORT-MANIFEST.md \
  && ok "manifest names the same pin" \
  || bad "adws/PORT-MANIFEST.md does not name pin $PIN"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git init -q "$tmp/up"
git -C "$tmp/up" remote add origin https://github.com/disler/super-simple-software-factory.git
if ! git -C "$tmp/up" fetch -q --depth 1 origin "$PIN"; then
  bad "could not fetch upstream at pin $PIN"
  printf '%d passed, %d failed\n' "$pass" "$fail"; exit 1
fi
git -C "$tmp/up" checkout -q FETCH_HEAD
T="$tmp/up/.claude/skills/sssf/templates"

# Rebuild the expected stamped tree exactly as the stanza stamps it.
mkdir -p "$tmp/expected/adws/adw_data" "$tmp/expected/adws/adw_sssf_config"
cp -R "$T/adws/." "$tmp/expected/adws/"
cp -R "$T/prompt_engineering" "$tmp/expected/adws/adw_data/prompt_engineering"
cp -R "$T/harness_engineering" "$tmp/expected/adws/adw_data/harness_engineering"
cp "$tmp/up/LICENSE" "$tmp/expected/adws/LICENSE"

# Manifest-listed deviations (#335/#336) are synced from the repo into the expected
# tree BY PATH (a basename -x would over-exclude sibling prompt files), so the
# byte-compare passes over them and over nothing else. Every path here MUST have a
# row in adws/PORT-MANIFEST.md — cross-checked so this list cannot drift ahead of
# the manifest. Keep it equal to SSSF_DEVIATED in scripts/vendor-skills.sh, plus
# the MOS-owned config and this manifest.
DEVIATED="adw_modules/agents.py adw_modules/agent_pi.py adw_modules/data_types.py adw_modules/quality.py \
adw_modules/git_helper.py adw_modules/gates.py adw_simple_sdlc.py adw_design_audit.py adw_sssf_config/sssf.config.yaml adw_modules/permissions.py \
adw_plan_build.py adw_plan_build_test.py adw_plan_build_test_quality.py \
adw_data/prompt_engineering/planner/system.md adw_data/prompt_engineering/planner/user.md \
adw_data/prompt_engineering/builder/system.md adw_data/prompt_engineering/reviewer/system.md \
adw_data/prompt_engineering/documenter/system.md adw_data/prompt_engineering/documenter/user.md \
adw_data/prompt_engineering/fe_builder/system.md adw_data/prompt_engineering/fe_reviewer/system.md \
PORT-MANIFEST.md"
for f in $DEVIATED; do
  grep -qF "$(basename "$f")" adws/PORT-MANIFEST.md \
    || bad "excluded from byte-compare but not manifest-listed: adws/$f"
  if [ -f "$ROOT/adws/$f" ]; then
    mkdir -p "$tmp/expected/adws/$(dirname "$f")"
    cp "$ROOT/adws/$f" "$tmp/expected/adws/$f"
  else
    bad "manifest-listed deviation missing from the tree: adws/$f"
  fi
done
DIFF_OUT="$(diff -r \
  -x __pycache__ -x '*.pyc' \
  -x sessions -x 'sssf.db*' -x archive \
  "$tmp/expected/adws" "$ROOT/adws" 2>&1)"
if [ -z "$DIFF_OUT" ]; then
  ok "adws/ byte-identical to upstream stamp at pin (manifest files excepted)"
else
  bad "adws/ deviates from upstream at pin:"
  printf '%s\n' "$DIFF_OUT" | sed 's/^/        /'
fi

# Root-stamped files: justfile stays byte-identical; .env.sample is a manifest-listed
# MOS deviation (roster note) — assert it exists, is manifested, and names no values.
# justfile carries ONE ruled MOS deviation (PORT-MANIFEST row: factory-run door): expected =
# upstream template with the same deterministic transform the vendor applies. Any OTHER drift
# still goes red, and the row must exist.
sed 's#uv run adws/#bash scripts/factory-run.sh #g' "$T/justfile" > "$tmp/justfile.expected"
cmp -s "$tmp/justfile.expected" "$ROOT/justfile" \
  && ok "justfile == upstream + the ruled factory-run transform (only)" \
  || bad "justfile deviates beyond the ruled factory-run transform"
grep -qF 'justfile' adws/PORT-MANIFEST.md \
  && ok "justfile deviation is manifest-listed" \
  || bad "justfile deviates but has no manifest row"
if [ -f "$ROOT/.env.sample" ]; then
  grep -qF '.env.sample' adws/PORT-MANIFEST.md \
    && ok ".env.sample present and manifest-listed as a MOS deviation" \
    || bad ".env.sample deviates but has no manifest row"
  grep -qE '^[A-Z_]+=[^[:space:]]' "$ROOT/.env.sample" \
    && bad ".env.sample carries a non-empty value — it must stay names-only" \
    || ok ".env.sample carries no values"
else
  bad ".env.sample missing from the repo root"
fi

grep -q '^Copyright (c)' adws/LICENSE \
  && ok "MIT notice carries the copyright line" \
  || bad "adws/LICENSE is missing its copyright line"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
