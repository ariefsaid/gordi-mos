# OFFICIAL SCORING REVIEW — V3 redesign (gpt-5.6-luna, owner-designated independent scorer)

You are the owner-designated INDEPENDENT scorer for the Gordi MOS V3 redesign. Your number is
the official acceptance result. You are READ-ONLY on source: no edits, no commits, no git.

## Setup (do everything yourself — provenance matters)
Work from `/Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/v3-redesign`. Confirm and record
`git log --oneline -1` (must be `61f6087` or later). Start YOUR OWN dev server:
`cd mos-app && npx vite --port 5399` — never reuse an already-listening port. The local Supabase
stack is up with 11 realistic demo tasks + 3 signals seeded. Log in via the demo "Director"
button. The E7 reference mockup is served at `http://localhost:8766/e7-prototype.html`
(#/home, #/work, #/record/t_fix_chiller). Drive everything with the agent-browser CLI; kill your
server when done.

## Method (mandatory)
Read first and use as your instruments — every finding must cite the specific rule/check:
- `.claude/skills/impeccable/SKILL.md` (General rules + Absolute bans) and
  `.claude/skills/impeccable/reference/product.md` (product register checks + bans)
- `.claude/skills/taste/SKILL.md` (§7 AI-tells, Rule 4 card discipline, Rule 5 states)
- `PRODUCT.md`, `docs/jtbd.md` (J01/J02/J12), `docs/experience-contract.md` Rules 1-12.

Render and judge at 1280, 1024, and 390 (full-page):
Home (/mos) · Tasks (/mos/work/tasks) · Signals (/mos/work/signals) · a task record opened from
the table (drawer at 1280) · the same task's full page · the E7 reference screens for
axis-by-axis comparison. Also exercise: the order toggle on Home, one filter + group on Tasks,
inline title edit (double-click), a record field edit (activate → Escape → Escape), Ask Deputy
on a record.

## Scoring (strict, adversarial — prior self-scores over-credited)
1. Nielsen-style 0-4 per heuristic H1-H10 with one-line pixel evidence each. Baseline: E7 = 27/40.
2. Structural anti-slop /10 (checks: one IA spine · one collection grammar · shared record
   anatomy · title+meta hierarchy · rhythm · card discipline · overlay/IxD · state semantics ·
   responsive ergonomics · decorative restraint). Baseline: E7 = 7/10.
3. E7-floor: list EVERY axis where the app reads WORSE than E7 (hard rule: must be zero).
4. The bar: >=32/40 AND >8.5/10 AND zero floor violations.

## Output (your entire final message)
Markdown: commit hash attestation · per-heuristic table with evidence · anti-slop checklist with
per-check verdicts · floor-violation list (or "none") · P0/P1 findings each with skill-rule
citation + file guess + fix direction · FINAL VERDICT line:
`OFFICIAL: <n>/40 · <n>/10 · floor violations <n> · BAR MET/NOT MET`.
