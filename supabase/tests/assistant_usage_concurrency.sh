#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/assistant_usage_concurrency.py" "${1:-supabase_db_gordi-writer-disposable}"
