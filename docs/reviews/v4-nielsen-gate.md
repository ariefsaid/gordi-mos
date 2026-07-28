# v4 app-wide Nielsen gate — round history

**Gate:** `OD-V4-4` — Nielsen **>30 app-wide**, owner-set 2026-07-27. Owner's framing:
*"dont judge it on per page basis"* — a strong surface must not mask a weak one.

**Method.** Every round is scored by **isolated agents, one per surface**, driving the live app at
375×812 and 1280×860 in both locales, following `reference/critique.md`'s Heuristics Scoring Guide
(0–4 per heuristic, `n/a` where genuinely inapplicable, applicable-max = 4 × heuristics scored).
**Never self-scored by the Director** — a standing project rule after a 34-vs-26 over-credit
incident. Aggregated as the **mean of per-surface percentages**, deliberately: summing totals over
maxima under-weights surfaces with fewer applicable heuristics, which is the masking effect the gate
exists to prevent.

Snapshots persist to `.impeccable/critique/`; read a series with
`node .claude/skills/impeccable/scripts/critique-storage.mjs trend <target> 5`.

## Round history

| Surface | R1 | R2 | R3 | R4 | Δ R3→R4 |
|---|---|---|---|---|---|
| Money · Dashboard | 28/40 | 28/40 | 31/40 | **34/40** | +3 |
| Café · Plan | 16/32 | 21/36 | 29/40 | **33/40** | +4 |
| App shell | 23/36 | 25/40 | 25/40 | **33/40** | **+8** |
| Home (cockpit) | 31/40 | 31/40 | 32/40 | **32/40** | 0 |
| Work · Tasks | 30/40 | 28/40 | 27/40 | **32/40** | **+5** |
| Inbox | 23/40 | 28/40 | **34/40** | **31/40** | **−3** |
| Café · Log | 24/40 | **17/40** | 29/40 | **29/40** | 0 |
| Work · Objectives | 18/40 | 18/40 | 23/40 | **29/40** | **+6** |
| **App-wide** | **24.9/40** | **24.8/40** | **28.8/40** | **31.6/40** | **+2.8** |

## R4 — **PASS**, 31.6/40 (79.1%), clearing the >30 bar by +1.6

R1, R2 and R3 failed (R3 by 1.2). R4 followed `harden`→`clarify`→`onboard`, `typeset`, `optimize`,
`doctor`, then `audit`→`extract`→`polish`.

**Three caveats, all material:**

1. **This grades an uncommitted local diff.** At scoring time the worktree carried ~137 uncommitted
   changes on `v4/redesign`, not on `dev` or `main`, and had never been through
   `scripts/pre-merge-check.sh` or a `docs/reviews/<branch>.md` battery. Four scorers independently
   `lsof`'d the port and said so. Per this repo's own binding rule — *green gates ≠ reviewed* —
   **31.6 is not a merge-readiness claim.**
2. **It is a thin pass.** Café · Log (29) and Objectives (29) are still individually under 30. The
   mean clears only because Money (34), Café · Plan (33) and the shell (33) carry them.
3. **The verdict agent's own delta table was wrong** and was corrected by hand before publication: it
   compared five surfaces against the *app-wide mean* (28.8) rather than their actual R3 scores,
   which reported **Inbox as +2.2 when it had in fact dropped 3 points** (34 → 31). The table above is
   the corrected one. *An aggregator's arithmetic is a claim, not a fact — check it.*

### Per-heuristic movement (app-wide means)

| Heuristic | Prior | R4 | Δ |
|---|---|---|---|
| **H10 Help & Documentation** | 2.0 | **3.5** | **+1.5** — biggest mover; went from weakest to tied-strongest |
| **H4 Consistency & Standards** | 2.375 | **3.375** | **+1.0** — credited to shared-component discipline, i.e. `extract` working |
| H9 Error recovery | 2.17 | 2.75 | +0.58 |
| H7 Flexibility & efficiency | 2.25 | 2.75 | +0.50 |

**The floor rotated.** H10 was the app's weakest heuristic for three rounds and is now joint-best,
almost entirely from one shared `HelpTip` primitive reaching all eight surfaces. **H7 and H9 are now
the weakest pair** — and they moved least despite being flagged for three consecutive rounds. Their
recurring drags are structural: no bulk actions, thin recovery paths.

### What moved the score, and what did not

Direction held — **every R4 gain traces to interaction-layer fixes, none to visual or layout polish.**
But magnitudes collapsed from the earlier 5–14pt swings to +0.2…+6, because the large concentrated
defects were already burned down; what remains is smaller, surface-specific residue.

**Café · Log stayed flat at 29 for the fourth-round-running reason:** real fixes landed *and* new real
defects surfaced in the same pass — a reproducible Discard-dialog hang (its scorer put H3 at 1/4,
*"trapped, no way out without refreshing"*) and a broken Tab order past the now-required note field.

The app-wide **Enter-key trap** fix was real and verified in source everywhere checked, but showed up
**diffusely** — fractions of a point per surface, never a single large gain — and was mostly credited
from code inspection rather than a live keypress, because the harness's synthetic `key` action
injects `key: ""`.

## The finding that outlived every individual score

**Layout and aesthetic work moved nothing. Interaction-defect fixes moved 5–14 points each.**

- Café · Log scored **24 → 24** across a round of heavy layout change (chrome cut ~100px, stepper
  replaced with a typed field, contrast fixed at the token layer, module translated). Then **+12** in
  one round from a single bug fix — wiring the variance-note flow so a submission can complete.
- Inbox **+12.5pp** then **+6** from error recovery: naming the expired-session cause and offering a
  real action instead of a "Try again" that re-fired the same failing call forever.
- Café · Plan **+8.3pp** from adding a filter to a 231-item list, then **+14.2pp** from closing a
  dead end.
- Tasks **−1**, and App shell **flat**, in the round where each received real improvements — because
  deeper testing surfaced defects that offset them.

**Corollary the Director got wrong twice.** After R2 the Director concluded the redesign had hit its
ceiling and recommended moving the gate. The owner pushed back, work continued, and R3 gained four
points. Then R2's own drops (Café Log 24→17, Tasks 30→28) turned out to be the review getting
*honest*, not the app regressing — R2 was the first round to drive flows end to end and hit a P0.
**A score that falls because testing got deeper is more useful than one that rises because testing
stayed shallow.**

## Defects the scoring surfaced that no design pass would have

- **A whole-app keyboard trap** (WCAG 2.1.1/2.1.2). `useCollectionKeyboard` bound Enter on `window`;
  while Tasks or Signals was mounted at desktop width, Enter was swallowed by **every focused control
  in the app shell** — rail links, header search, view chips, sort headers. A keyboard-only user could
  not activate anything or navigate away. Found by `polish`, fixed at the narrowest level.
- **Café · Log accepted `"b"` as a variance explanation.** `showNote` depended on `error`, which only
  exists while the note is empty — so the first keystroke unmounted the textarea and dumped focus to
  `<body>`, then Submit unblocked on that single character (DD-18).
- **A count derived from a truncated display array** — Home reported 6 when 9 items needed attention
  (DD-10).
- **A band reporting typed-not-logged production**, claiming "No entries logged yet today"
  immediately after a successful submit (DD-7).

## Method caveats worth carrying forward

- **Three false findings** in one round came from the harness's synthetic key events —
  `computer key Return` injects `key: ""`, which the app correctly ignores. Any keyboard claim must be
  made with a verified native event.
- **Concurrency corrupts measurement.** Running scorers against the same dev server as active build
  agents produced readings where persona, locale and viewport flipped mid-script (HMR reloads).
  Stagger them, and re-verify `location.href` and `innerWidth` inside every measurement script.
- **`npx tsc --noEmit -p tsconfig.json` is a false pass** in `mos-app` (solution file, checks nothing).
  Only `npm run typecheck` and `npm run build` are evidence.

## What remains

The feature/capability work the scorers itemised is catalogued as **F1–F10** in `docs/backlog.md`,
with F1 (Café · Plan renders inert for its own primary persona) the largest single item at +4–6.
Contradictions needing owner decisions are the **X-1…X-11** register in `docs/v4-inheritance.md`.
