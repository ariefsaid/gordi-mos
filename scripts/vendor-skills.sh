#!/usr/bin/env bash
# Re-vendor the project's cherry-picked Claude Code skills into .claude/skills/.
# These skills are third-party and GITIGNORED — run this once after cloning.
# (superpowers is a Claude Code plugin, installed separately — see the note at the end.)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/.claude/skills"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST"

echo "==> gstack (cherry-picked; project-scoped — we do NOT run gstack's global ./setup)"
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "$TMP/gstack"
for s in careful freeze guard cso design-review design-consultation; do
  rm -rf "${DEST:?}/$s"
  cp -R "$TMP/gstack/$s" "$DEST/$s"
  rm -f "$DEST/$s/SKILL.md.tmpl"
done

echo "==> jeffallan/claude-skills (feature-forge + spec-miner only)"
git clone --depth 1 --filter=blob:none --sparse https://github.com/jeffallan/claude-skills.git "$TMP/jeff"
git -C "$TMP/jeff" sparse-checkout set skills/feature-forge skills/spec-miner
for s in feature-forge spec-miner; do
  rm -rf "${DEST:?}/$s"
  cp -R "$TMP/jeff/skills/$s" "$DEST/$s"
done

echo "==> harden spec-miner: read-only + Write (drop Bash)"
sed -i.bak 's/^allowed-tools:.*/allowed-tools: Read, Grep, Glob, Write/' "$DEST/spec-miner/SKILL.md"
rm -f "$DEST/spec-miner/SKILL.md.bak"

# --- UI/UX design skills (vetted SAFE-with-caveats; see docs/design-workflow.md) ---
echo "==> impeccable (pbakaus/impeccable) — design/critique/extract; phone-home DISABLED"
git clone --depth 1 https://github.com/pbakaus/impeccable.git "$TMP/impeccable"
rm -rf "${DEST:?}/impeccable"
cp -R "$TMP/impeccable/skill" "$DEST/impeccable"
[ -f "$DEST/impeccable/SKILL.src.md" ] && mv "$DEST/impeccable/SKILL.src.md" "$DEST/impeccable/SKILL.md"
# caveat: hard-disable the impeccable.style version phone-home in the vendored copy
if [ -f "$DEST/impeccable/scripts/context.mjs" ]; then
  sed -i.bak 's#if (process.env.IMPECCABLE_NO_UPDATE_CHECK) return null;#return null; // vendored: phone-home disabled#' "$DEST/impeccable/scripts/context.mjs"
  rm -f "$DEST/impeccable/scripts/context.mjs.bak"
fi

echo "==> taste (Leonxlnx/taste-skill — v1 stable) — anti-slop craft discipline"
git clone --depth 1 https://github.com/Leonxlnx/taste-skill.git "$TMP/taste"
rm -rf "${DEST:?}/taste"
cp -R "$TMP/taste/skills/taste-skill-v1" "$DEST/taste"

echo "==> ui-ux-pro-max (nextlevelbuilder) — CORE skills only (skip Gemini generative sub-skills)"
git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git "$TMP/uupm"
# Upstream restructured: payload moved from .claude/skills/<s> to src/<s>, and the skill dir uses
# RELATIVE SYMLINKS (data -> ../../../src/...) that dangle when copied verbatim — cp -RL
# dereferences them so the vendored copy is self-contained. Old path kept as fallback.
for s in ui-ux-pro-max design-system ui-styling; do
  for base in "$TMP/uupm/src/$s" "$TMP/uupm/.claude/skills/$s"; do
    if [ -d "$base" ]; then
      rm -rf "${DEST:?}/$s"
      cp -RL "$base" "$DEST/$s"
      break
    fi
  done
done
# NOTE: deliberately NOT vendoring design/banner/slides/brand sub-skills (Gemini-API generative; need GEMINI_API_KEY).

echo "==> grill-with-docs (mattpocock/skills) — intake grilling + CONTEXT.md glossary steward"
# Vetted 2026-06-11 at commit 694fa30 (3 prompt-only .md files, no executables). Re-vet on re-vendor.
git clone --depth 1 --filter=blob:none --sparse https://github.com/mattpocock/skills.git "$TMP/mps"
git -C "$TMP/mps" sparse-checkout set skills/engineering/grill-with-docs
rm -rf "${DEST:?}/grill-with-docs"
cp -R "$TMP/mps/skills/engineering/grill-with-docs" "$DEST/grill-with-docs"

echo "==> agent-browser (discovery stub) — rendered UI verification from pi (docs/pi-delegation.md §3a)"
# The CLI (npm i -g agent-browser) serves its own version-matched usage skill via
# `agent-browser skills get core`; the vendored file is only a discovery stub. Source = the global
# CLI's skill, mirrored from the PMO checkout where it was first vendored.
mkdir -p "$DEST/agent-browser"
if [ -f /Users/ariefsaid/Coding/PMO/.claude/skills/agent-browser/SKILL.md ]; then
  cp /Users/ariefsaid/Coding/PMO/.claude/skills/agent-browser/SKILL.md "$DEST/agent-browser/SKILL.md"
fi

echo
echo "Vendored: careful freeze guard cso design-review design-consultation feature-forge spec-miner impeccable taste ui-ux-pro-max design-system ui-styling grill-with-docs agent-browser"
echo "superpowers (plugin) — install once with:"
echo "  claude plugin install superpowers@claude-plugins-official --scope project"
