# Final intent-fidelity audit — redesign buildout steps 4–11

**Branch:** `claude/redesign-buildout-completion-vdrd17` · **Date:** 2026-07-18 · **Posture:** adversarial,
build-vs-OWNER-INTENT (not build-vs-spec). Read-only. Authorities in provenance order: the three verbatim
provenance extracts (🧑 OWNER blocks) → `docs/decisions.md` OD-REDESIGN-1..67 + ADR-0025/0050/0051 +
`docs/experience-contract.md` → the as-built specs/ledgers/code.

**Method note:** "the docs are authority; the transcripts are evidence" (provenance README) — where a mid-thread
owner position was superseded later (e.g. Q32 deputy-writes-into-Weekly-Update-Draft → Q33 remove Weekly Update),
the LATER position is the intent the build must honour.

---

## Group A — Owner-verbatim vs built

### A1 — Signal capture-minimalism & the four fields — **FAITHFUL**
Owner (Q42/OD-42, D28) + OD-59: composer opens with only content + owning Team + occurrence time + author;
category/attention/mentions are post-capture. Built exactly (`signal-composer.tsx`; AC-420 asserts the four
fields at ≤390px; spec §4). No re-litigation. Clean.

### A2 — Composer field labels vs Rule 12 plain-language — **DRIFTED (disclosed, ratify item 7)**
Rule 12 (owner-directed): "no system vocabulary … a barista wouldn't say." The composer keeps the spec-literal
`Owning Team` / `Occurred at`. "Owning Team" is mild jargon for the least-technical persona. Already on the
consolidated ratify list (item 7) as "plain-language rename optional." Defensible; flagged.

### A3 — Attention (FYI / Needs attention / Urgent) — **DRIFTED (disclosed, ratify item 5) — but note it neuters a locked field**
Owner-verbatim (grill L2081-2098, OD-43): attention is a first-class triage cue "FYI, Needs attention, Urgent,"
and the feed/Home order by it. As built: the `attention` column exists and the feed/card *display* + *weight* it
(`signal-card.tsx:49`, AC-426), **but the composer/card expose no control to SET or raise it** — the composer
hard-codes `'FYI'` in its preview (`signal-composer.tsx:88`) and no tap-to-raise pill was built. Net effect:
every Signal is FYI forever; the attention-weighting the owner asked for is inert in practice. Disclosed
(step-4 ledger L97-98; consolidated item 5). Owner should decide defer-vs-fast-follow — this is a locked field
with no way to exercise it.

### A4 — Occurrence-as-tasks, "never Process Run" — **FAITHFUL**
Owner-verbatim (L96 "the word 'Process Run' should almost never be an entry point … a barista sees 'Today's
checklists'"; L464 "It kills a noun nobody needs"; OD-58): "Process Run" is UI-forbidden; occurrences surface as
a grouping caption. Built and *proven* — AC-622/AC-714 assert the literal string "Process Run" never renders;
FR-611 enforced across `/work/tasks` grouping and `/cafe`. Strong fidelity.

### A5 — Capture-first / two-fronts — **FAITHFUL**
Owner-verbatim (L2658, L2681, OD-61/66): manager density AND high-school-barista obviousness, via role-adaptive
disclosure. Built: Tasks capture-first for member, denser filter view for manager; café `/cafe` capture-first;
step-6 design review re-scored the manager front 4/10→8.5/10 and Rule-12 cold-start PASS both fronts. Honoured.

### A6 — Feed on Home below a non-removable attention brief (OD-17/18/59) — **FAITHFUL**
Built: `AttentionBrief` (4 live lanes) + personal canvas (`MyWeekPanel` tiles + `SignalFeedSection`), region-order
toggle default attention-first, "Needs attention · N" summary preserved when personal-first (FR-508/509;
home-page.tsx). Q1 remains provisional (consolidated item 1) as OD-67 instructed. Note: OD-17's *composable*
personal/deputy widget canvas is a fixed tile set (deputy-composition deferred) — a disclosed deferral, not a twist.

### A7 — "Create follow-up Task" = the canonical Task composer (OD-39/D25) — **DRIFTED (step-4 disclosed, NOT on consolidated list)**
Owner (OD-39, D25): from a Signal, "Create follow-up Task pushes **the canonical Task composer** in the same
panel stack with Signal context prefilled." As built (step-4 ledger L119-129): a **minimal title-only capture**
that auto-fills R=A=viewer, BU from the owning Team — it does NOT open `TaskSurface`/`TaskDrawer`. This both
under-serves OD-39's "one record two doors" and sits in tension with Rule 11 (reuse the canonical composer);
worse, silent R=A=viewer can mint mis-owned follow-ups. Disclosed in the step-4 ledger, **missing from the
consolidated ratify list**. → add to ratify list.

---

## Group B — Decision-chain twists (owner → OD → ADR → spec → plan → build → fix waves)

### B1 — Signal visibility (grill Q36 → OD-36/50 → ADR-0050 D4 → migration) — **FAITHFUL-BUT-NOTE (ratify item 2)**
Owner (OD-36): default reach narrow + upward; sibling Teams don't see each other; mentions grant. ADR-0050 D4
spec'd `mos.can_read_signal` as **SECURITY INVOKER**. Build shipped it **SECURITY DEFINER** — a *forced*
deviation (INVOKER recurses to stack-overflow on the self-referential SELECT policy; DEFINER returns a boolean
only, org-gated first, PUBLIC-revoked). This is a correct engineering fix, security-auditor-cleared, and on the
ratify list (item 2). The end-state default-deny + 5 grants matches the START intent. The related author-only
content guard (`20260717000001`, security HIGH-1 fix) tightened a real hole (a `signal.retract` holder could
rewrite another author's body) — a fix that *strengthens* OD-45 immutability, not a drift.

### B2 — Home composition (OD-17/18 two regions → OD-59 amendment → attention brief + feed) — **FAITHFUL**
Traced clean: OD-17/18 (two regions, attention non-removable, order = user pref) → OD-59 (feed ambient below
brief) → step-5 build (`AttentionBrief` + region-order store). No twist; region-order persistence is
`localStorage` (disclosed, ratify item 8) pending the Profile column.

### B3 — Occurrence spawn: explicit-Start → due-list → the fix-wave scope+collapse — **FAITHFUL-BUT-NOTE (mild drift)**
Chain: grill (Q3 first-class run) → OD-11/58 → ADR-0051 D6 (explicit idempotent Start, no scheduler, `due`
read-model) → build (`StartRunControl` in `/work/tasks`) → step-6 design BLOCK (due-list *floods* the table) →
fix wave 86dc2b5 (SCOPE to viewer's Teams + COLLAPSE to a "N due to start" trigger rendered **after** the Tasks
table, collapsed by default). Question posed by the audit: did collapsing under-serve "the manager starts the
day's work"? Assessment: **defensible.** The owner's own framing is "Runs as a browsable collection is a manager
**archive**" (L96) while the barista/lead's *prominent* start is on `/cafe` ("Start today's opening", Step 7).
Demoting the `/work/tasks` starter below the table matches "archive," not a prominent CTA, and the design review
re-scored the manager front 8.5/10. Noted only because a manager who lives in `/work/tasks` now reaches
"start today's recurring work" via a below-the-table disclosure — worth an owner glance, not a twist.

### B4 — Café member read-only vs the barista-owns-the-opening JTBD (RATIFY-7A) — **DRIFTED (disclosed, ratify item 10)**
Owner F2 demo vision (L638): "open #/cafe → 'Start today's opening' → one Task with checks inside … provenance
'PIC: Ayu — via Barista on shift'"; JTBD J16/S1 puts the barista-opener at the centre; OD-66 barista-obviousness
front. As built (RATIFY-7A, upholding step-6 RATIFY-5): `process.start` stays **ops_lead+admin**; a café *member*
sees today's opening **read-only** with a non-dead "your shift lead starts today's opening" affordance. This is
the correct fail-closed default under OD-67 (owner absent, don't invent a capability), and it is **flagged as the
single most important café ratification** (consolidated item 10, RATIFY-7A). The owner's role table (grill L2591)
does grant baristas "execute assigned Tasks/Checks" — not "start Runs" — so the conservative call is not baseless.
Honestly surfaced; needs the owner's yes/no on Option B (`cafe.open` for rostered members).

*Provenance sub-note (FAITHFUL-BUT-NOTE):* owner F2 wanted "via **Barista on shift**"; the build renders "via
<Role name>" without "on shift" (step-6 fix wave item 4 judgment call — shift/roster context isn't built yet, so
"on shift" can't be rendered truthfully). Honest degrade, not a twist.

### B5 — Weekly Update retirement (OD-33/48/64) vs the surviving My Week panel + read paths — **TWISTED**
This is the one genuine build-vs-intent contradiction. Owner-verbatim Q33 (L… "im thinking to remove the weekly
updates … i want a layer where all teams can provide a note/update … realtime") → OD-33 (Signal **supersedes**
Weekly Update) → OD-48 ("**No** Weekly Brief object, employee filing, Draft/Submitted state, missing reminder, or
**review roster**") → OD-64 (no dead "Write update" promises in front of staff). Step 11 retired the standalone
Weekly-Update page + write/review panes (good). **But `MyWeekPanel` survives on Home, and its manager
`TeamModule` — the heading "Your team — Week of <dates>" + a per-report weekly-update *status roster* sourced from
the retired `mos.weekly_updates` via `getMyUpdate`/`listTeamUpdates` — is gated `SHOW_WEEKLY_UPDATES && isManager`,
NOT by `hideLegacyCadenceCards`** (`my-week-panel.tsx:140-154`), while `SHOW_WEEKLY_UPDATES = true`
(`config/features.ts:5`). Home passes only `hideLegacyCadenceCards` (`home-page.tsx:217`), which suppresses the
two cadence *strips* but not the manager roster. Net: **a manager on Home still sees a retired Weekly-Update
review roster** — precisely the "review roster / filing status" OD-48 killed. The step-11 ledger (L135-137)
*documents* this ("not by [hideLegacyCadenceCards]"), so it was known and left; the guiding code comment
(home-page.tsx:216 "the direct My Week route remains available") is also **stale** — the router has no My Week
route (`/updates` → `/work/signals`). This is not on the consolidated ratify list. **Needs a fix or an explicit
owner call.** Trivial fix: gate `TeamModule` by `hideLegacyCadenceCards` too, or set `SHOW_WEEKLY_UPDATES=false`.

---

## Group C — Quicksand WITHIN this run (fix waves undoing/contradicting each other)

Diff-checked the step-5 home fix wave, step-4 styling wave, step-6 CQ/security wave, step-6 design wave, step-7
minors, and the 785cdf3 polish commit against files touched by 2+ waves (`messages.ts`, `tasks-workspace.tsx`,
`group-header-row.tsx`, `cafe-opening-panel.tsx`, signal components).

- **No later wave reverts an earlier wave's decision.** The step-6 design fix wave is internally coherent:
  item 1 (scope+collapse due-list), item 3 (gate the assign affordance that item 1's surface had left *ungated*
  on desktop — a strengthening, not a contradiction), item 6 (drop the "1 to assign" stutter item 1/3 created).
  Each is additive/corrective, not oscillating. — **CLEAN**
- **`tasks-workspace.tsx` touched by two steps** (step-6 CQ extraction `useOccurrenceGroups`; step-7 C2
  `?occurrence=` mount effect). Step-7 ledger (L249-253) explicitly flagged the reconciliation risk against
  `main`'s extraction; branch-tip gates are green (typecheck + 2760 vitest + 727 pgTAP), so it reconciled. —
  **CLEAN (coordination seam, resolved)**
- **Two resolve-UI shells for one job — FAITHFUL-BUT-NOTE.** `/work/tasks` resolves pending PICs via
  `OccurrenceAssignDialog` (a hand-rolled `role="dialog"`), `/cafe` resolves inline in `CafeOpeningPanel`. Both
  correctly reuse the *same* `PendingResolution` inner component (Rule 11 satisfied), but the two host shells are
  a mild duplication the step-7 ledger itself flagged (L83, L267-270). Not a contradiction; a consolidation
  candidate.
- **Polish commit (785cdf3)** is pure additive copy hygiene (Deputy chip drops "weekly update" noun, catalog Add
  composes its noun, Money H1, NotFound link) — consistent with Rule 7/12, contradicts nothing. — **CLEAN**

No genuine quicksand found inside this run — the fix waves compound rather than fork (the exact outcome
OD-56/65 intended by moving iteration into the app).

---

## Group D — Ratify-list honesty (is the 15-item consolidated list COMPLETE?)

The branch ledger calls its list "**Every** conservative default taken while the owner was absent." Grepping the
step ledgers surfaces **three** disclosed conservative defaults / deviations that did **not** reach the
consolidated list — the silent-decision failure mode:

1. **Signal Retract has no UI control** (step-4 ledger L114-118). OD-45 gives author/deputy a retract-and-repost
   path for wrong provenance; the DB gate is built and proven (AC-412) but **no retract affordance was wired** —
   a user cannot retract a wrong Signal from the app. Disclosed in step 4, absent from the consolidated list. →
   ratify.
2. **Signal Create-follow-up-Task is a minimal auto-R=A=viewer capture, not the canonical composer** (step-4
   ledger L119-129; = Group A7). OD-39/D25/Rule 11. Disclosed in step 4, absent from the consolidated list. →
   ratify.
3. **Home manager Weekly-Update `TeamModule` still renders** (step-11 ledger L135-137; = Group B5). Disclosed in
   step 11, absent from the consolidated list — and it is the one item that also rises to TWISTED. → ratify +
   fix.

Minor: **RATIFY-9-3** (Home `data-money-ar-slot` intentionally untouched, step-9 ledger) is folded into
consolidated item 12 only implicitly; harmless.

Otherwise the consolidated list is accurate: steps 6 (RATIFY-1..10), 7 (7A..7F), 8 (8A), 9 (9-1/9-2), 10
(placeholder copy + quiet archetype) all map cleanly to items 9-13, and the inherited items 14/15 are real.
The list is **~85% honest** — good, but its "every" claim is overstated by the three omissions above.

---

## Per-group counts

| Group | CLEAN / FAITHFUL | FAITHFUL-BUT-NOTE | DRIFTED (disclosed) | TWISTED |
|---|---|---|---|---|
| A — owner-verbatim vs built | 3 (A1, A4, A5, A6) | — | 3 (A2, A3, A7) | 0 |
| B — decision-chain | 1 (B2) | 2 (B1, B3) | 1 (B4) | 1 (B5) |
| C — quicksand within run | 3 (waves, workspace, polish) | 1 (two resolve shells) | 0 | 0 |
| D — ratify-list honesty | — | — | 3 omissions (2 new + 1 = B5) | 0 |

---

## Genuine twists needing action

1. **Home shows managers a retired Weekly-Update team roster (Group B5 / D-3).** `MyWeekPanel.TeamModule`
   ("Your team — Week of …" + per-report weekly-update status, from `mos.weekly_updates`) renders on Home for any
   manager because it is gated `SHOW_WEEKLY_UPDATES && isManager` (=true) and NOT by `hideLegacyCadenceCards`
   (`my-week-panel.tsx:140-154`, `home-page.tsx:217`, `config/features.ts:5`). This contradicts OD-33/48/64
   (Signal supersedes Weekly Update; no review roster/filing; no retired-cadence surface in front of staff). The
   stale comment "the direct My Week route remains available" (home-page.tsx:216) points at a route that no
   longer exists. **Action:** gate `TeamModule` by `hideLegacyCadenceCards` (or flip `SHOW_WEEKLY_UPDATES=false`),
   and drop the stale comment — then this is CLEAN. Needs a one-line fix or an explicit owner "keep it" call.

*(No other build-thing contradicts settled intent. A3, A7, B4 are softened-but-defensible drifts, all better
handled as ratify-list additions than emergency fixes.)*

## Additions to the ratify list (disclosed in a step ledger, missing from the consolidated 15)

1. **Signal Retract has no UI** — author/deputy cannot retract a wrong Signal from the app (DB gate only). OD-45.
   (step-4 ledger L114-118)
2. **Signal "Create follow-up Task" is a minimal auto-R=A=viewer capture**, not the canonical Task composer
   prefilled in the panel stack. OD-39 / D25 / Rule 11. (step-4 ledger L119-129)
3. **Home manager Weekly-Update `TeamModule` still renders under `SHOW_WEEKLY_UPDATES=true`** — decide keep-vs-hide
   (this is also the Genuine-twist fix above). OD-33/48/64. (step-11 ledger L135-137)
4. *(Already present but worth re-emphasising given A3):* consolidated item 5 (**attention pill not built**) — the
   attention-weighting the feed relies on is inert with no way to raise a Signal above FYI. OD-43. Confirm
   defer-vs-fast-follow.

---

## Overall verdict — **FAITHFUL-WITH-DRIFTS**

The domain intent survived the specs → plans → builds → fix-wave chain remarkably well: the load-bearing owner
directives (Signal capture-minimalism, "Process Run" never in the UI, capture-first / two-fronts, feed-below-
attention-brief, default-deny upward Signal visibility, idempotent human-in-the-loop spawn, fail-closed ambiguity)
are all built and, in several cases, positively test-asserted. No decision was silently *inverted*, and the fix
waves compound rather than fork — the OD-56/65 "iterate once, inside the app" bet paid off. There is exactly **one
genuine twist** — a leftover pre-redesign Weekly-Update manager roster that still renders on Home for managers,
contradicting the Signal-supersedes-Weekly-Update decision; it is flag-fixable and was documented (but not
escalated) in the step-11 ledger. The remaining gaps are honest, mostly-disclosed **drifts** (attention setter,
signal retract UI, minimal follow-up-Task capture, café-member start, panel-only signal record) — every one a
conservative fail-closed call under OD-67, and each should be swept onto the owner's post-step-11 ratify list. The
consolidated ratify list is substantially honest but overstates "every"; add the three omissions above.
