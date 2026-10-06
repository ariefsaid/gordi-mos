#!/usr/bin/env bash
# Setup script for a Claude Code CLOUD environment (claude.ai/code).
#
# WHERE THIS GOES: paste `bash scripts/cloud-setup.sh` into the cloud environment's
# **Setup script** field (environment settings UI). It runs BEFORE the session starts and its
# filesystem output is CACHED, so every later session begins with the CLI, the Docker images, the
# node_modules and Chromium already on disk.
#
# Split of duties (this is the whole point):
#   cloud-setup.sh (HERE, cached, once)   — install/pull everything slow: CLI, images, deps, browser
#   cloud-agent-bootstrap.sh (per session) — start Supabase, write env, verify the app renders
# The cache stores FILES, not running processes, so the stack must still be started each session.
#
# Verified facts this relies on (docs.claude.com, checked 2026-07-17):
#   - docker / dockerd / docker compose are pre-installed
#   - `public.ecr.aws` (Supabase's registry) IS in the default Trusted allowlist, as is
#     `*.amazonaws.com` (ECR streams layer blobs from S3). No Custom network config needed.
#   - Resource ceilings 4 vCPU / 16 GB RAM / 30 GB disk. Measured need: stack images 1.19 GB,
#     runtime RAM ~1.4 GB (~413 MiB for the 5 containers the bootstrap keeps). Ample headroom.
#   - Skills are NOT in git (`.claude/` is its own local repo), so this script vendors them.
#
# ⚠ NOT YET RUN IN A REAL CLOUD SESSION. Each step below is individually proven (it mirrors
# .github/workflows/integration.yml, which is green), but the composition is unproven in that
# runtime. If a step fails, fix it here rather than working around it in the session.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# ── 1. Supabase CLI ─────────────────────────────────────────────────────────────
# Not a repo dependency (package.json ships @supabase/supabase-js only), so a fresh sandbox has no
# CLI. Version pinned to match CI (integration.yml) — a sandbox that drifts from CI is a lie
# about CI.
SUPABASE_VERSION="$(tr -d '[:space:]' < "$REPO/supabase/CLI_VERSION")"
say "Installing Supabase CLI ${SUPABASE_VERSION}"
source scripts/lib/cloud-tools.sh
BIN=/usr/local/bin; [ -w "$BIN" ] || { BIN="$HOME/.local/bin"; echo "installing to ~/.local/bin — ensure it is on PATH"; }
install_supabase_cli "$SUPABASE_VERSION" "$HOME/.local/share/supabase" "$BIN"
supabase --version

# ── 2. Pre-pull the Docker images (this is what the cache is FOR) ────────────────
# Starting the stack once here pulls exactly the right image set; the images persist in the cached
# filesystem, so each session's `supabase start` is fast. Then stop — the cache keeps files, not
# processes. Same exclusion list as CI and as cloud-agent-bootstrap.sh; keep all three identical.
say "Pre-pulling Supabase images (cached for every later session)"
ensure_dockerd 60
supabase start -x edge-runtime,functions,studio,meta,imgproxy,storage,realtime,vector,analytics
supabase stop

# ── 3. App dependencies + browser ───────────────────────────────────────────────
say "Installing app dependencies"
(cd "$REPO/mos-app" && npm ci)

say "Installing Chromium for Playwright"
(cd "$REPO/mos-app" && npx playwright install --with-deps chromium)

# ── 4. Skills (gitignored — a clone has none) ───────────────────────────────────
# The review batteries load skills from .claude/skills/, which is vendored, not tracked here.
# vendor-skills.sh overlays .claude/skill-overrides/ onto the upstream set.
say "Vendoring skills"
bash scripts/vendor-skills.sh

say "SETUP COMPLETE — cached for subsequent sessions"
cat <<'EOF'
  Each session still starts the stack (the cache holds files, not processes):
      bash scripts/cloud-agent-bootstrap.sh
  Then read CLAUDE.md and CONTEXT.md before touching anything.
EOF
