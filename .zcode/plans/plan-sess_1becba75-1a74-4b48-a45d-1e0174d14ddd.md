## Build: SOPs + shifts + Projects screen + finish the editor conversion

**Decision recap (confirmed across the last several turns):**
- **SOP is a first-class object** that can attach to **any Project OR Process** (not just Processes). A Process is *mostly* recurring SOP checks; a Project is *mostly* novel tasks with *optional* SOP-driven checks (e.g. opening-checklist during a new-location buildout).
- **An SOP's steps generate the recurring checkable tasks.** Each step = target + acceptable range + unit + check cadence. The floor captures a **Check** against the spec → pass/fail computed inline → a failed check becomes an **Exception** → auto-creates a **correction Task** (links the quality loop into the work loop).
- **Shift awareness is minimal this round**: a `Shift` = person + station/area + time window, editable as "today's roster." It drives (a) which checks generate for each person today (their station's SOPs), (b) exception routing to the on-shift supervisor, (c) "your shift today" on the floor's Orient. No week-view, swaps, or recurring builders (the seam, deferred).
- **Detail access = page canonical + quick-edit drawer** on lists (status/PIC/due without navigating).
- **Standards is a rail peer** — a library view across all SOPs by area (kitchen/bar/roastery/ecom), each opening its detail page. SOPs *also* appear linked on their owning Project/Process page. Two ways in, like Projects.

**Current ground truth (audited):** editor foundation + 3 converted pages exist and pass (typing, `/` menu, block insert, prop popovers, todo toggle, tree-fix). 15 pages still static. `work-projects` nav exists but is a dead link (no screen). No SOP/shift/standards code anywhere. `.proj-grid`/`.proj-card` CSS already exists. `data-sees` permission gating works via `hidden`.

---

### Layer 0 — quick fixes (do first, cheap)
- Fix the dead `work-projects` nav (build the screen in Layer 3).
- Add `target`/`due` to `editor.js`'s `PROP_OPTIONS` (currently empty popovers on those props) — or add a small set of date/text options.

### Layer 1 — CSS + editor primitives (`base.css` + `editor.js`)
**`base.css` append (~90 lines):** SOP-spec step row (`.sop-step` with target/range/unit/cadence fields), check-result row (`.check-row` pass/fail/done with inline ✓/✗ and evidence chip), exception banner (`.exception` → links the correction task), standard card (`.std-card` for the library), shift roster row (`.shift-row`: person + station + window), audit-trail entry. Mobile: roster + standards reflow.

**`editor.js` extend:** Add SOP-specific block types to `BLOCK_TYPES` (`step` — a SOP spec step with editable target/range/cadence; `check` — a captured reading with pass/fail). Add `E.captureCheck(stepEl)` that reads the step's spec, shows an inline pass/fail vs the entered value, and on fail calls a new `E.raiseException(step, reading)` that inserts an `.exception` block + a linked correction-task chip. Add `evidence` handling (a file/photo attach affordance on any failing check). Add `target`/`due`/`station`/`area` to `PROP_OPTIONS`. No change to the existing routing/keydown contract.

### Layer 2 — Shift object + today's roster
Minimal roster surface: a **Shifts** section (rail peer, or under Operate) showing today's roster per area — editable rows of `person + station + window`. Personas seed the roster fixture (Yusuf→roastery 07–15, Sari→ecommerce 09–17, Budi→café 06–14, etc.). The floor's Orient pane reads it for "your shift today" + "your checks today." Exception routing reads it for the on-shift supervisor. A `Shift` is modeled but has no schedule-builder UI this round.

### Layer 3 — Projects screen + Standards screen (rail peers)
- **`work-projects`** screen (fixes the dead nav): `.proj-grid` of all 4 work-systems (2 Projects: GKID lease, Menu readiness; 2 Processes: Roastery yield, Pick-pack SLA). Each `.proj-card` → its page. Filter row (All / Projects / Processes / by lane). This is the "flat view of all projects/processes" peer to the tree's hierarchical view.
- **`standards`** screen: a library of all SOPs across areas. `.std-card` grid grouped by area (Kitchen / Bar / Roastery / Ecommerce). Each card: SOP name, owning Project/Process, cadence, last-check freshness, pass-rate, owner. → opens its SOP detail page. Filter by area.

### Layer 4 — SOP detail page + check loop
- **SOP detail page** (`page-sop-*`): editable title, props (owner, cadence, version, area, owning Project/Process), the **spec** as `.sop-step` blocks (each: parameter + target + range + unit + cadence — e.g. "Dose 18g ±0.3 per-shot"), an **audit trail** section (recent readings + exceptions + corrections), and a "Capture check" CTA.
- **Capture-a-check flow**: a modal/inline form that reads the SOP's steps, lets the operator enter the reading, computes ✓/✗ vs range inline, requires evidence on ✗, and on submit either logs a pass or raises an Exception. This is the "checked repeatedly, evidenced" half of your loop.
- **Exception → correction Task**: a failed check auto-inserts an `.exception` block on the SOP page AND a correction Task (PIC = on-shift person, Supervisor = on-shift lead) visible in Work. Resolving the task closes the exception. This is the "audited, corrected, maintained" half.

### Layer 5 — Process/Project pages gain their SOP + checks
- **Process pages** (`page-proc-yield`, `page-proc-pickpack`): show RACI + their **SOP (spec)** + **today's generated checks** (the standing steps, pass/fail) + improvement tasks. The Daily Log deepens from "log a number" to "check against spec."
- **Project pages**: gain an optional **SOP section** (e.g. GKID's opening-checklist SOP) proving SOPs attach to Projects too — not just Processes.

### Layer 6 — finish the editor conversion (agent; mechanical)
Convert the 15 remaining static pages to the editable `.editor-blocks`/`.eb` pattern, mirroring the 3 gold-standard pages. Objective pages → `page-obj-hq` template; Project/Process → `page-proj-gkid` (+ new SOP section); Task → `page-task-sign-lease`. **Dispatched to a subagent** — it's proven pattern-replication. Includes the 6 bespoke screens only where block-editing applies (orient widgets stay as-is).

### Layer 7 — quick-edit drawer on lists
Add a right-side quick-edit drawer to the Projects grid and (in α/β) the task tables: click a row → drawer with status/PIC/due/Supervisor fields → save in one tap, no navigation. One object, one page; the drawer is a fast field-view.

---

### Files touched

| File | Change |
|---|---|
| `base.css` | +SOP/step/check/exception/standard/shift/audit CSS (~90 lines); mobile reflow for roster+standards. |
| `editor.js` | +`step`/`check` block types, `captureCheck`, `raiseException`, evidence, `target`/`due`/`station`/`area` props. |
| `g-pages.html` | +Standards screen, +Projects screen (fix dead nav), +SOP detail page(s), +Shifts/roster, rebuild Process/Project pages with SOP+checks, convert 15 static pages (agent), +quick-edit drawer markup. Keep shell/persona/overlays/responsive. |
| `app.js` | (possibly) extend `PERSONAS` `sees` with `standards`/`ops` capabilities for gating; otherwise unchanged. |

α (`prototype.html`) and β (`b-board.html`) get the quick-edit drawer (Layer 7) but are otherwise untouched.

---

### Verification bar (what "done" looks like)
1. **Projects screen** loads from the rail; grid of 4 work-systems; click → page.
2. **Standards screen** loads; SOP library by area; click → SOP detail page.
3. **SOP detail page**: editable spec steps (target/range/cadence); audit trail visible.
4. **Capture a check**: enter reading → inline ✓/✗ vs range → evidence on ✗ → submit.
5. **Failed check → Exception**: auto-creates a correction Task visible in Work; resolving closes it.
6. **Today's roster** editable; floor Orient shows "your shift today" + "your checks today."
7. **SOPs appear on both a Process and a Project** page (proving non-binary ownership).
8. **Quick-edit drawer** opens from a list row; status/PIC/due edit in place.
9. All 18+ pages editable (typing, `/` menu, block insert, prop popovers).
10. Existing behavior preserved: impersonation (5), font control, ⌘K, capture/followup/weekly forms, responsive, warmer identity. Re-run editor checks + smoke test, desktop + mobile + screenshot.

---

### Build order (checkpoints marked)
1. **Layer 0+1** — CSS primitives + editor.js extensions (step/check/exception/evidence). *Checkpoint: a single SOP page with a working check→exception flow.*
2. **Layer 2** — Shift roster (minimal) + floor Orient wiring.
3. **Layer 3** — Projects screen + Standards screen (rail peers).
4. **Layer 4** — SOP detail page + capture-check modal + exception→task.
5. **Layer 5** — Rebuild Process/Project pages with SOP+checks (including a Project SOP to prove non-binary).
6. **Layer 6** — **Agent**: convert the 15 remaining static pages to editable.
7. **Layer 7** — Quick-edit drawer on lists.
8. **Verify** — editor + SOP loop + smoke, desktop + mobile + screenshot.

I'll checkpoint after Layer 1 (the check→exception flow is the riskiest new mechanic — confirm it feels right before replicating). Layers 6 will go to an agent as you've asked.