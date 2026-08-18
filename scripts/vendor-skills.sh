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

# GUARD: a tracked override that is missing from disk means this run silently applies pure upstream.
#
# On 2026-08-06 all five overrides sat DELETED-BUT-TRACKED in `.claude`. `git status` showed ' D ' on
# each and nobody looked, so none of this project's skill customisations were being applied —
# agents ran vendored upstream, including the /code-review battery this repo gates on. Nothing
# caught it, because a deleted file produces no error and the populated `skills/` directory still
# looked authoritative. At least one agent concluded the overrides simply did not exist.
#
# It runs BEFORE the first clone, because every vendored skill is `rm -rf`d and replaced further
# down — including all five overridden ones. Aborting after that point would leave the tree in exactly
# the incident state it exists to prevent.
#
# The check lives HERE rather than in CI because `.claude/` is gitignored by this repo — CI can
# never see it — and a standalone script would be one more gate nobody runs. This is the tool that
# consumes the overrides, so it is the one place the absence is guaranteed to matter.
if [ -e "$ROOT/.claude/.git" ]; then
  MISSING="$(git -C "$ROOT/.claude" ls-files 'skill-overrides/*/SKILL.md' | while read -r rel; do
    [ -f "$ROOT/.claude/$rel" ] || printf '  %s\n' "$rel"
  done)"
  if [ -n "$MISSING" ]; then
    echo "ERROR: these skill overrides are TRACKED but missing from disk:" >&2
    printf '%s\n' "$MISSING" >&2
    echo >&2
    echo "Vendoring now would apply pure upstream and silently drop this project's customisations." >&2
    echo "Restore them first:  git -C .claude checkout -- skill-overrides/" >&2
    echo "See docs/agents/skills.md." >&2
    exit 1
  fi
fi


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

echo "==> disler/super-simple-software-factory — sssf orchestrator skill + adws/ factory skeleton (#334)"
# PINNED, unlike every other stanza: the factory skeleton is stamped into the TRACKED tree (adws/),
# so an upstream bump must be a deliberate act — raise SSSF_PIN, re-run, review `git diff adws/`,
# update adws/PORT-MANIFEST.md. scripts/vendor-sssf.test.sh proves the stamped tree is byte-identical
# to upstream at this pin except the manifest-listed MOS files.
# Vetted 2026-08-18 at this pin — RE-VET ON EVERY PIN BUMP: skill scripts/{install,make_adw,
# make_config}.py are local file-stampers (no network); apps/visualizer is a bun/Vue app serving
# localhost only; templates/adws has no network beyond what the pi/claude runners themselves do.
SSSF_PIN="de31374882e7a4e3e5b7bb9bd09e69dc2f779356"
git init -q "$TMP/sssf"
git -C "$TMP/sssf" remote add origin https://github.com/disler/super-simple-software-factory.git
git -C "$TMP/sssf" fetch -q --depth 1 origin "$SSSF_PIN"
git -C "$TMP/sssf" checkout -q FETCH_HEAD
rm -rf "${DEST:?}/sssf"
cp -R "$TMP/sssf/.claude/skills/sssf" "$DEST/sssf"
# Stamp the factory skeleton the way upstream's own skill installer
# (.claude/skills/sssf/scripts/install.py) lays it out — but force-overwrite instead of
# skip-if-exists, so a re-vendor surfaces upstream drift as a git diff on the tracked files.
# EXCEPT the deviated files carrying ported PMO deltas (#335): those are excluded from the
# stamp — upstream drift on them is merged BY HAND on a pin bump, per adws/PORT-MANIFEST.md.
# MOS-authored files inside adws/ (PORT-MANIFEST.md; LICENSE is upstream's, relocated) survive
# because only upstream-owned subtrees are removed first.
SSSF_T="$TMP/sssf/.claude/skills/sssf/templates"
SSSF_KEEP="$(mktemp -d)"
for f in adw_modules/agents.py adw_modules/data_types.py adw_modules/quality.py adw_simple_sdlc.py; do
  if [ -f "$ROOT/adws/$f" ]; then
    mkdir -p "$SSSF_KEEP/$(dirname "$f")"; cp "$ROOT/adws/$f" "$SSSF_KEEP/$f"
  fi
done
rm -rf "$ROOT/adws/adw_modules" "$ROOT/adws/adw_data/prompt_engineering" "$ROOT/adws/adw_data/harness_engineering"
mkdir -p "$ROOT/adws/adw_data" "$ROOT/adws/adw_sssf_config"
cp -R "$SSSF_T/adws/." "$ROOT/adws/"
for f in adw_modules/agents.py adw_modules/data_types.py adw_modules/quality.py adw_simple_sdlc.py; do
  if [ -f "$SSSF_KEEP/$f" ]; then cp "$SSSF_KEEP/$f" "$ROOT/adws/$f"; fi
done
rm -rf "$SSSF_KEEP"
cp -R "$SSSF_T/prompt_engineering" "$ROOT/adws/adw_data/prompt_engineering"
cp -R "$SSSF_T/harness_engineering" "$ROOT/adws/adw_data/harness_engineering"
cp "$SSSF_T/sssf.config.yaml" "$ROOT/adws/adw_sssf_config/sssf.config.yaml"
cp "$TMP/sssf/LICENSE" "$ROOT/adws/LICENSE"                # MIT notice travels with the vendored code
cp "$SSSF_T/env.sample" "$ROOT/.env.sample"                # root-stamped, exactly as install.py does
cp "$SSSF_T/justfile" "$ROOT/justfile"                     # root-stamped, exactly as install.py does
# (install.py's .gitignore entries are committed directly in this repo's tracked .gitignore)

echo "==> agent-browser (discovery stub) — rendered UI verification from pi (docs/pi-delegation.md §3a)"
# The CLI (npm i -g agent-browser) serves its own version-matched usage skill via
# `agent-browser skills get core`; the vendored file is only a discovery stub. Source = the global
# CLI's skill, mirrored from the PMO checkout where it was first vendored.
mkdir -p "$DEST/agent-browser"
if [ -f /Users/ariefsaid/Coding/PMO/.claude/skills/agent-browser/SKILL.md ]; then
  cp /Users/ariefsaid/Coding/PMO/.claude/skills/agent-browser/SKILL.md "$DEST/agent-browser/SKILL.md"
fi

# --- Project overrides (OVERLAY, not replace) ---
# Our upgraded files (committed, git-tracked, de-branded, OURS: implement, to-spec, code-review, tdd, handoff)
# are OVERLAID on top of the pristine vendored skill — our SKILL.md wins while upstream SIBLINGS
# (tests.md, mocking.md, agents/…) are KEPT. Before overlaying, snapshot the pristine upstream to
# .claude/skill-original/<name>/ (gitignored) so `diff skill-original/<s>/SKILL.md
# skill-overrides/<s>/SKILL.md` shows exactly our delta and a re-vendor reveals upstream drift.
# See the "### Skills" section in CLAUDE.md and docs/agents/skills.md (written 2026-08-06; this
# comment previously cited a "skill-ownership table" that did not exist, which is why agents kept
# editing the generated skills/ directory).
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
echo "Vendored: gstack(careful freeze guard cso design-review design-consultation) jeffallan(spec-miner) impeccable taste ui-ux-pro-max design-system ui-styling sssf agent-browser + mattpocock full eng+prod set"
echo "sssf factory skeleton stamped into adws/ at pin $SSSF_PIN (see adws/PORT-MANIFEST.md)"
echo "Project overrides applied from .claude/skill-overrides/ (implement to-spec code-review tdd handoff)."
echo "superpowers (plugin) — install once with:"
echo "  claude plugin install superpowers@claude-plugins-official --scope project"
