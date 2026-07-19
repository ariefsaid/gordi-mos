# Redesign provenance — the source conversations (extracted, owner prompts verbatim)

**Why this exists:** the E7 redesign was decided in agent threads that live only on one laptop,
unversioned. The decisions survived in `docs/decisions.md`; the **reasoning** did not. These extracts
put the *why* in the repo so a cloud agent — or anyone — can recover it.

**What these are:** the **owner↔assistant prose only**, pulled out of the raw transcripts. Tool calls,
tool results, file dumps and system noise are **excluded** — that's where secrets live, and this repo is
public. Extracts were secret-scanned before commit (no keys/tokens/`.env`; the two `service_role`
mentions are design discussion, not credentials).

**Owner prompts are byte-verbatim** — fenced in ```text blocks under "🧑 OWNER (verbatim)", with
original line breaks and structure preserved. Nothing of the owner's wording was normalised.

| File | Thread | What it gives you |
|---|---|---|
| `01-origin-critique-2026-07-08.md` | Codex, 2026-07-08 (136 turns, from 6.4 MB raw) | **Why a redesign at all.** "be as critical for all the design it currently has" → "build high fidelity mockups for all of them". |
| `02-the-50plus-qna-grill-2026-07-10_12.md` | Codex, 2026-07-10 → 07-12 (261 turns, from 28 MB raw) | **★ The 50+ QnA grill** that produced **OD-REDESIGN-1..55 + ADR-0025**. Open this to answer "why is OD-REDESIGN-N what it is?" |
| `03-frustration-and-buildout-2026-07-13_16.md` | Claude, 2026-07-13 → 07-16 (392 turns, from 7.9 MB raw) | **★ Why the plan looks like it does now.** The owner's frustration in his own words (mockups "not happy enough, but passable"; the fork problem; "might as well reiterate when building rather than reiterating twice") → **OD-REDESIGN-56..66**, the Experience Contract, the 11-step buildout, steps 1–3. |

**Composite oracle over these extracts:** [`owner-directives-index.md`](owner-directives-index.md) —
the standing "what good looks like" index. NOT e7-fidelity: it resolves owner-word → lost-good (any
generation) → owning-default, per surface, with status at branch tip. Governed by the owner correction
"i dont want to look exactly like e7 … moving quicksand" (2026-07-19). Reviews score touched surfaces
against it.

## Rules for using these

1. **The docs are authority; these are evidence.** A transcript contains positions that were
   *superseded mid-conversation*. Never implement from a transcript — implement from
   `docs/decisions.md` / `docs/experience-contract.md` / the buildout plan. Use these to understand
   *why*, or to settle "did we already decide this?"
2. **Grep, don't read linearly** — search the OD number or the concept.
3. **Raw originals** (local only, not committed — machine-bound): see
   `docs/redesign-decision-index.md` § Provenance for full paths, formats and caveats.

Referenced from: `docs/redesign-decision-index.md` § Provenance · `docs/requirements-evolution.md`
(E7 provenance) · `docs/agent-context.md` (cold-start pointer).
