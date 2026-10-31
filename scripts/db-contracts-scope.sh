#!/usr/bin/env bash
# Prints the changed paths in a git range that feed the db-contracts DB steps; empty = none.
# Usage: db-contracts-scope.sh <range>. Fails closed: renames list the old path, and any path git
# still quotes (control characters) counts as a DB input.
set -euo pipefail
# Add a path here when a DB step starts reading it.
DB_INPUTS_RE='^("|supabase/|api-docs/reference\.md$|mos-app/e2e/|mos-app/package-lock\.json$|mos-app/playwright\.config\.|scripts/(applied-path-check|prove-migration-rollbacks|lint-security-definer|api-reference|mcp-catalog|supabase-start-retry|supabase-image-cache|with-db-lock|check-migration-order|db-contracts-scope)\.sh$|scripts/lib/(applied-path-fingerprint\.sql|api-catalog\.sql|sql-blank\.sh|flock-run\.sh)$|\.github/workflows/db-contracts\.yml$)'
git -c core.quotePath=false diff --no-renames --name-only "$1" | grep -E "$DB_INPUTS_RE" || true
