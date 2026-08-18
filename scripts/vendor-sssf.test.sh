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
cp "$T/sssf.config.yaml" "$tmp/expected/adws/adw_sssf_config/sssf.config.yaml"
cp "$tmp/up/LICENSE" "$tmp/expected/adws/LICENSE"

# Byte-compare, excluding only manifest-listed MOS files and gitignored runtime.
DIFF_OUT="$(diff -r \
  -x PORT-MANIFEST.md \
  -x __pycache__ -x '*.pyc' \
  -x sessions -x 'sssf.db*' \
  "$tmp/expected/adws" "$ROOT/adws" 2>&1)"
if [ -z "$DIFF_OUT" ]; then
  ok "adws/ byte-identical to upstream stamp at pin (manifest files excepted)"
else
  bad "adws/ deviates from upstream at pin:"
  printf '%s\n' "$DIFF_OUT" | sed 's/^/        /'
fi

cmp -s "$T/env.sample" "$ROOT/.env.sample" \
  && ok ".env.sample byte-identical to upstream templates/env.sample" \
  || bad ".env.sample deviates from upstream templates/env.sample"
cmp -s "$T/justfile" "$ROOT/justfile" \
  && ok "justfile byte-identical to upstream templates/justfile" \
  || bad "justfile deviates from upstream templates/justfile"

grep -q '^Copyright (c)' adws/LICENSE \
  && ok "MIT notice carries the copyright line" \
  || bad "adws/LICENSE is missing its copyright line"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
