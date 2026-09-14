#!/usr/bin/env bash
# Run the repo-vendored Impeccable browser detector inside an existing agent-browser session.
# Usage: scripts/impeccable-browser-check.sh <session> [url] [WIDTHxHEIGHT]
set -euo pipefail

cd "$(dirname "$0")/.."
session="${1:-}"
url="${2:-}"
viewport="${3:-}"

if [ -z "$session" ]; then
  echo "Usage: $0 <agent-browser-session> [url] [WIDTHxHEIGHT]" >&2
  exit 64
fi
command -v agent-browser >/dev/null 2>&1 || {
  echo "agent-browser is required for rendered Impeccable checks" >&2
  exit 1
}

if [ -n "$viewport" ]; then
  if [[ ! "$viewport" =~ ^([0-9]{2,5})x([0-9]{2,5})$ ]]; then
    echo "Invalid viewport '$viewport'; expected WIDTHxHEIGHT" >&2
    exit 64
  fi
  agent-browser --session "$session" set viewport "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" >/dev/null
fi

if [ -n "$url" ]; then
  agent-browser --session "$session" open "$url" >/dev/null
  agent-browser --session "$session" wait 500 >/dev/null
fi

cat scripts/vendor/impeccable/detector/detect-antipatterns-browser.js \
  | agent-browser --session "$session" eval --stdin >/dev/null

result="$(agent-browser --session "$session" --json \
  eval "window.impeccableDetect({ decorate: false, serialize: true })")"

printf '%s' "$result" | node --input-type=module -e '
  import fs from "node:fs";
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!payload?.success || !Array.isArray(payload?.data?.result)) {
    process.stderr.write(`Rendered Impeccable scan failed: ${JSON.stringify(payload)}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(payload.data.result, null, 2)}\n`);
  if (payload.data.result.length > 0) process.exit(2);
'
