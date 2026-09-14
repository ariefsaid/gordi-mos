#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$ROOT/scripts/impeccable-detect.mjs"
VENDOR="$ROOT/scripts/vendor/impeccable"

test -f "$ENTRY"
test -f "$VENDOR/detector/detect-antipatterns.mjs"
test -f "$VENDOR/lib/impeccable-config.mjs"

help_output="$(node "$ENTRY" --help)"
printf '%s\n' "$help_output" | grep -Fq 'Usage: impeccable detect'

fixture="$(mktemp "${TMPDIR:-/tmp}/impeccable-detector.XXXXXX.css")"
trap 'rm -f "$fixture"' EXIT
printf '%s\n' '.card { font-family: Inter, sans-serif; }' > "$fixture"

set +e
scan_json="$(node "$ENTRY" --json --no-config "$fixture")"
scan_rc=$?
set -e

test "$scan_rc" -eq 2
printf '%s' "$scan_json" | node --input-type=module -e '
  import fs from "node:fs";
  const findings = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!Array.isArray(findings) || !findings.some((finding) => finding.antipattern === "overused-font")) {
    throw new Error(`expected overused-font finding, got ${JSON.stringify(findings)}`);
  }
'

set +e
node "$ENTRY" --json http://127.0.0.1:1 >/dev/null 2>&1
url_rc=$?
set -e
test "$url_rc" -ne 0

printf '%s\n' 'impeccable detector smoke check passed'
