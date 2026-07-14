## Step 1 — styling (spec + code-quality, gpt-5.4 cross-family)

Verdict: **BLOCK**

### Strengths
- The diff stays within the intended surface area: CSS/token files, `DESIGN.md`, two new test files, and the guard script. I found **no `*.tsx` changes and no production `*.ts` behavior change**.
- The `--warning-foreground` cascade fix looks correct: deep-brown now wins in light, dark, Tailwind mapping, and bare shadcn compat (`mos-app/src/index.css:34`, `mos-app/src/index.css:46`, `mos-app/src/index.css:119`, `mos-app/src/index.css:182`). I found no remaining red fallback in the token path.
- The dark neutral ramp is consistently warmed (`mos-app/src/styles/tokens/theme-dark.css:96-99`, `mos-app/src/styles/tokens/theme-dark.css:131-157`).
- I found **no `--e7-*` runtime token leak** in the reviewed app CSS files.

### Issues

#### Critical
- `mos-app/src/styles/tokens/theme-light.css:103`, `mos-app/src/styles/tokens/aliases.css:39` — **FR-013 / “no new token names” is violated.** This commit introduces `--ds-background-sunken` and `--accent-tint`. The signed spec says E7 values must be ported onto existing app token names, not add new ones.
- `scripts/pre-merge-check.sh:47-53` — **AC-002 guard is over-broad and contradicts the approved step scope.** It fails on any `*.ts`/`*.tsx` file, which includes the two explicitly allowed new test files in this step. As written, once the ledger exists this branch will still fail its own guard.

#### Important
- `mos-app/src/styles/tokens/contrast.test.ts:50-63` — the dark-theme contrast fixture uses **approximate / stale hardcoded values** (`0.09/0.106/0.922/0.702`) instead of the warmed dark values now shipped in `theme-dark.css`. That weakens AC-007 as a behavior check.
- `mos-app/src/styles/tokens/contrast.test.ts:164-168` — the test title says it checks `warning-foreground-dark`, but the assertion actually checks `--ds-color-amber11-dark` on `--ds-color-amber3-dark`. That means the named token is **not** what the test proves.
- `DESIGN.md:105` — docs/runtime drift remains for the overlay shadow. Runtime now uses navy-tinted overlay shadow, but the doc still points `overlay` at `var(--ds-font-color-primary)` rather than the navy-tinted formulation. That leaves **FR-014 only partially satisfied**.

### Spec conformance summary
- **Satisfied:** warm surfaces/text/borders/action/status/shadows, warning-foreground bug fix, warmed dark ramp, and zero TS/TSX behavior change.
- **Not satisfied:** **FR-013** (new token names introduced), **AC-002** guard correctness, and **FR-014** full DESIGN/runtime sync.
- **No scope creep found** beyond the two test files and guard script already called out by the request.

### Test integrity (BDD)
- `token-values.test.ts` makes the right harness correction by reading source CSS directly instead of pretending jsdom resolves the cascade.
- But it also locks in the two new token names, so it currently enforces a spec violation rather than catching it.
- `contrast.test.ts` still proves intent only partially because of the stale dark fixture values and the mislabeled dark-warning assertion.

### Overall assessment
**BLOCK** — visually this is close and the warning/deep-brown fix is correct, but I would not approve until the new-token-name breach, the AC-002 guard bug, and the stale/mislabeled contrast assertions are corrected.

### Step 1 — BLOCK resolution (Director, 2026-07-14)

All 5 findings fixed in the commit above; re-verified:
- **FR-013 (Critical):** `--accent-tint` + `--ds-background-sunken` were dead (only a code comment / nothing consumed them) → **removed**, not renamed. Breach gone + dead code deleted.
- **AC-002 guard (Critical):** the blanket `*.ts/*.tsx` guard was wrong for the shared gate (blocks steps 2+ on the stacked integration branch) → **removed**; AC-002 stands as a verified property of the step-1 commit (this review confirmed zero *.tsx / zero prod *.ts change).
- **contrast.test dark fixture (Important):** stale cool values → **warmed** to shipped theme-dark values.
- **contrast.test mislabel (Important):** dark-warning test now asserts `--warning-foreground-dark` (was amber11/amber3).
- **DESIGN.md overlay (Important):** overlay shadow → navy-tinted, matches runtime (FR-014).

Re-run: token-values + contrast green (94), typecheck clean, earlier full suite (2548) + e2e (38) unaffected (CSS/test-only). **Step-1 verdict now: APPROVE** (findings cleared; Director visual lens passed light+dark earlier). Formal owner visual sign-off still pending (owner AFK).

## Step 2 — shell + routes (spec + code-quality, gpt-5.4 cross-family)

**Verdict: BLOCK** (0 Critical · 5 Important · 2 Minor). IA move + routing/aria-current strong; not spec-clean. Findings:
- IMPORTANT top-bar.tsx:247-291 — FR-006: header still renders UserChip; spec = header ends at Search·Inbox·Deputy, profile in rail footer.
- IMPORTANT rail-nav.tsx:168-197 — FR-005: footer shows name+role, spec = {Site} {role}.
- IMPORTANT context-row.tsx:20-33 — FR-024: uses person.full_name as scope, spec = resolved scope/team/BU.
- IMPORTANT router.tsx + slice-stub-page.tsx — NFR-007: stub titles hardcoded English (no ID locale).
- IMPORTANT command-menu.tsx + top-bar.tsx — new chrome strings hardcoded English (Ask Deputy/Share Signal/Create Task/Navigate/Recent/Search/placeholders) — EN/ID parity.
- MINOR shell-routes-redirects.spec.ts — /kitchen→/cafe redirect not in e2e table.
- MINOR rail-nav.test.tsx:101-105 — footer test weaker than FR-005.
- Director live-verify (rail/redirects/aria/⌘K) + gates (2572 unit, 41 e2e) already green; these are code+spec-conformance gaps.

### Step 2 — BLOCK resolution (fix round gpt-5.4 + Director verify, 2026-07-15)

All 7 findings fixed (commits a658a0a..eb248ec) + re-verified:
- FR-006 header UserChip **removed** (Director live-confirmed: header = logo+breadcrumb · Search·Inbox·Deputy, no chip).
- FR-005 rail footer → **{Site} {role}**; footer test tightened (finding 7).
- FR-024 context-row → **resolved scope**, not person name.
- NFR-007 stub route titles → **localized** via useT (H1 + document.title).
- i18n chrome strings → **localized** (Director live-confirmed ID: Tanya Deputi · Bagikan Sinyal · Buat Tugas · Beranda · Kerja · Cari).
- MINOR /kitchen→/cafe **added** to redirect e2e (AC-005 green).
Re-run: typecheck clean · 2575 unit green · shell e2e 8/8. **Step-2 verdict now: APPROVE.** Formal owner visual sign-off + walkthrough still pending (owner AFK); Director live-verified the shell.
