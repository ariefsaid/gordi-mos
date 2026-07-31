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

echo "==> jeffallan/claude-skills (spec-miner only)"
# feature-forge RETIRED 2026-07-31: its EARS/AC discipline folded into the upgraded `to-spec`
# override; the interview half is already covered by grill-with-docs (loop step 1 intake).
git clone --depth 1 --filter=blob:none --sparse https://github.com/jeffallan/claude-skills.git "$TMP/jeff"
git -C "$TMP/jeff" sparse-checkout set skills/spec-miner
for s in spec-miner; do
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

echo "==> mattpocock/skills — full engineering + productivity sets"
# Vetted 2026-07-31 at HEAD: eng+prod skills are prompt-only .md + a harmless per-skill codex
# `agents/openai.yaml` interface config; the ONLY executable is
# diagnosing-bugs/scripts/hitl-loop.template.sh (a benign interactive template — no net/eval/telemetry).
# Re-vet on re-vendor. We vendor ONLY engineering/ + productivity/ (skip deprecated/in-progress/personal/misc).
git clone --depth 1 --filter=blob:none --sparse https://github.com/mattpocock/skills.git "$TMP/mps"
git -C "$TMP/mps" sparse-checkout set skills/engineering skills/productivity
for cat in engineering productivity; do
  for d in "$TMP/mps/skills/$cat"/*/; do          # */ matches dirs only → category README.md skipped
    s="$(basename "$d")"
    rm -rf "${DEST:?}/$s"
    cp -R "$d" "$DEST/$s"
  done
done

echo "==> agent-browser (discovery stub) — rendered UI verification from pi (docs/pi-delegation.md §3a)"
# The CLI (npm i -g agent-browser) serves its own version-matched usage skill via
# `agent-browser skills get core`; the vendored file is only a discovery stub. Source = the global
# CLI's skill, mirrored from the PMO checkout where it was first vendored.
mkdir -p "$DEST/agent-browser"
if [ -f /Users/ariefsaid/Coding/PMO/.claude/skills/agent-browser/SKILL.md ]; then
  cp /Users/ariefsaid/Coding/PMO/.claude/skills/agent-browser/SKILL.md "$DEST/agent-browser/SKILL.md"
fi

# --- Project overrides (OVERLAY, not replace) ---
# Our upgraded files (committed, git-tracked, de-branded, OURS: implement, to-spec, code-review, tdd)
# are OVERLAID on top of the pristine vendored skill — our SKILL.md wins while upstream SIBLINGS
# (tests.md, mocking.md, agents/…) are KEPT. Before overlaying, snapshot the pristine upstream to
# .claude/skill-original/<name>/ (gitignored) so `diff skill-original/<s>/SKILL.md
# skill-overrides/<s>/SKILL.md` shows exactly our delta and a re-vendor reveals upstream drift.
# See CLAUDE.md skill-ownership table.
OVERRIDES="$ROOT/.claude/skill-overrides"
ORIGINAL="$ROOT/.claude/skill-original"
if [ -d "$OVERRIDES" ]; then
  for d in "$OVERRIDES"/*/; do
    [ -d "$d" ] || continue
    s="$(basename "$d")"
    if [ -d "$DEST/$s" ]; then
      mkdir -p "$ORIGINAL"; rm -rf "${ORIGINAL:?}/$s"; cp -R "$DEST/$s" "$ORIGINAL/$s"   # snapshot pristine
    fi
    echo "==> override (overlay): $s — our files win, upstream siblings kept"
    mkdir -p "$DEST/$s"
    cp -R "$d". "$DEST/$s/"                                                              # overlay contents
  done
fi

echo
echo "Vendored: gstack(careful freeze guard cso design-review design-consultation) jeffallan(spec-miner) impeccable taste ui-ux-pro-max design-system ui-styling agent-browser + mattpocock full eng+prod set"
echo "Project overrides applied from .claude/skill-overrides/ (implement to-spec code-review tdd)."
echo "superpowers (plugin) — install once with:"
echo "  claude plugin install superpowers@claude-plugins-official --scope project"
