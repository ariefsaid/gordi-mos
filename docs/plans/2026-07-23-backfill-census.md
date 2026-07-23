# Gen-1 Backfill Census — Consolidated Verdict

> **Status:** consolidation of the generation-1 standing-audit battery run against worktree
> `v3-redesign` @ `63a0be5` (one finance pass observed a concurrent advance to `2f57fa3`, a verified
> descendant — validity intact). Ten audit passes: 6 surface censuses (chrome-top-bar, chrome-nav,
> chrome-cmdk, chrome-deputy-panel, chrome-signal-composer, auth/infra-6pack) + 1 record surface
> (follow-up) + 3 cross-cutting axes (dark-mode, locale-id, finance-persona).
> **This is a ledger, not a change.** No code/git touched. Every DO item still owes its own
> issue → build → review-battery loop.

---

## 1. VERDICT

### 1a. Severity roll-up (deduped, systemic finding named once)

| Sev | Finding | Surfaces where it materialized | Maps to guard / planned rule |
|---|---|---|---|
| **CRITICAL** | **SEC-1** `/cafe/*` (log·plan·stock) routes unguarded + `ops.kitchen_logs` RLS insert/update is org-scoped only (no team/role predicate) → any authenticated persona can write production logs, reached from Finance's own Home | finance-persona D1 | RLS-on-every-business-table gate; escalate `security-auditor` (OWASP/STRIDE) |
| **CRITICAL** | **SYS-1** `--ds-font-color-inverted` flips near-black in dark theme but the brand chips it sits on are theme-invariant → every "text on solid brand chip" fails WCAG AA in dark mode (avatars 1.01–1.16, primary buttons 3.44) | dark-mode F1 (all 6 surfaces); top-bar D2; signal-composer F1 | D-4 contrast (MECHANIZABLE), D-1 token discipline; recurrence of OD-P4-11 pt2 + the dq-badge.css light-only fix (F1a) |
| **HIGH** | **SYS-2** sub-44px phone tap targets, recurring, none covered by `tap-targets.css.test.ts` | nav D1 (mobile-drawer 36 / user-chip 40); cmdk D2 (.cm-item 36); signal-composer F2 (datetime 32 / close 32 / mention-row 36); auth/infra F1 (back-links 21–23) | E1/E2 (MECHANIZABLE), D9-class; contradicts P-39 |
| **HIGH** | **TB-1** shell `.drawer-shell-split` (Inbox quick-triage + Deputy) at `top:0 z-drawer` over a static-z `<header>` → covers entire top-bar right cluster incl. the bell that opened it | top-bar D1 | contradicts OD-P4-9; CSS's own "floats over main content" intent |
| **HIGH** | **NAV-2** compact icon-rail (920–1099.98px) tooltip computes visible but is clipped by forced `overflowX:auto` on the 72px `<aside>` → zero label disclosure for sighted mouse/kbd users in that band | nav D2 | E6/A9-adjacent (rendering bug in a MECHANIZABLE affordance; Step-4 geometry catches it, CSSOM lies) |
| **HIGH** | **SYS-3** elevation shadow tokens use `color-mix` of `--brand-navy` (mid-tone in dark) → shadows collapse on every card/tile/popover in dark mode (Money 13 KPI tiles) | dark-mode F2 | D-6 (covers the overcorrection dir only — undercorrection is an inventory gap) |
| **HIGH** | **SIG-2** Finance persona cannot post a Signal: `listAuthorTeams` returns 0 (no `team_memberships` seed) → empty unlabeled team `<select>`, submit disabled forever, no empty-state | finance-persona D2 | F4 (state grammar) + OD-REDESIGN-49/50 (primary-team requirement) |
| **HIGH** | **I18N-1** whole surfaces render zero translated strings under `id`: Money (all KPI/tabs/chart), Admin People (all), Kitchen KPI-strip + Log table headers | locale-id F1/F2/F3 | ADR-0021 i18n seam (D12); H1/H4 |
| **HIGH** | **FU-1** Follow-up record Step-2.5 FAILs: declared Settlement region absent (actions `[]`, live only on gated queue); 9/9 fields carry per-field provenance captions (the anti-pattern Task's F2-fix removed); Age field absent | follow-up (Step2.5 F1/F3/F5; N1) | record-page-anatomy spec §2.3; LAW-1/3/6; H1 naked-by-omission |
| **MEDIUM** | **CMDK-1** palette query/active/records state never resets between close→reopen; default Recent/Actions/Navigate view unreachable after first use | cmdk D1 | state-reset; F1/F2-adjacent |
| **MEDIUM** | **SYS-4** text-on-tint dark: active rail pill (blue text on dark-navy `blue3`, 2.91) + `@mention` chips (3.14) | dark-mode F3 | D-4/D-5 contrast |
| **MEDIUM** | **SYS-5** off-ladder inline font sizes (15/16/26px) in page-level styles the KIT-VOCAB-FONT scan never sees | auth/infra F2 (login/recovery/auth-shell/demo/profile/404) | C3 (MECHANIZABLE, plan top-10 #1) |
| **MEDIUM** | **TB-3** Create button accessible name ("Open actions") shares no substring with visible "Create" (WCAG 2.5.3) | top-bar D3 | H4/label-in-name |
| **MEDIUM** | **I18N-2** status/attention enums render raw English on record doors while the sibling collection pill translates the same datum (Task Status; Signal attention; Signal type-kicker "SIGNAL") | locale-id F4/F5/F8 | i18n-seam wiring gap in `record-field.tsx`/`signal-feed-rows.tsx` |
| **MEDIUM** | **AUTH-1** skipped heading on `/events`: h1 → EmptyState hard-coded h3, no h2 | auth/infra F3 | G1 (impeccable skipped-heading, MECHANIZABLE) |
| **LOW** | **DEP-1** Deputy history empty/loading bypass shared state-kit grammar (`"…"`, no role=status; empty `<div>`, no CTA) | deputy F1 | F1/F2 (MECHANIZABLE) |
| **LOW** | i18n tail: account menu (F6), Tasks "Card" tab (F7), truncation clip on id search box (F9) | locale-id F6/F7/F9 | i18n-seam |
| **LOW** | signal-composer: no loading affordance beyond `disabled` (F3); disabled `@BU` rows no reason title (F4) | signal-composer F3/F4 | F1/E3; H4/G2 |

### 1b. Guard/rule coverage verdict
- **Every green gate held (66/66, 70/70, 52/52, 76/76, 20/20) and caught none of the above** — confirms "green gates ≠ reviewed." The single mechanized phone-floor guard (`tap-targets.css.test.ts`) is a hard-coded selector list; **all four SYS-2 instances live in files/inline-styles it never scans** — this is exactly the E2 gap the mechanization plan names.
- **Highest-value mechanizables, now proven materialized:** D-4 (contrast, plan #7) → SYS-1/4; C3 (type ladder, plan #1) → SYS-5; E1/E2 (touch, plan #6) → SYS-2; G1 → AUTH-1; F1/F2 → DEP-1/CMDK. D-6 has a real **inventory gap** (dark-mode shadow *undercorrection*, SYS-3) with no rule.
- **impeccable `detect.mjs` was unrunnable in every worktree pass** — `.claude/skills/` is gitignored/unvendored. Detector half of Step-0 is structurally incomplete for the whole battery.

---

## 2. PER-SURFACE COMPACT CENSUS

### chrome-top-bar (Dewi/Cahya · 1280/768/390)
Clean: 56px header no overflow all widths; 390px tap targets all ≥44; responsive collapse + one-launcher honored; focus-return contract (bell/deputy/⌘K); badge accessible name labelled; control-axis byte-identical across personas (role diff confined to Navigate group); theme toggle; breadcrumb correctness.
Findings: **D1 HIGH (TB-1)** · **D2 HIGH (SYS-1)** · **D3 MED (TB-3)**. Step-2.5 N/A (global chrome).

### chrome-nav (Dewi/Cahya/Krishna/Fitri · 1280/1000/390)
Clean: persona×destination matrix exact on all 3 surfaces, no leakage/no missing gate; `aria-current` single-source incl. More-fallback; rail scroll-containment (D6); badge names labelled; bottom-tab + FAB targets ≥44; focus ring present; desktop 36px rail is mouse-primary (in-scope, not a violation).
Findings: **D1 HIGH (SYS-2)** · **D2 HIGH (NAV-2)**. Info: phone tabs carry no count badges (parity gap, no rule → FLAG). Step-2.5 N/A.

### chrome-cmdk (Dewi/Krishna · 1280/390)
Clean: number census N/A (zero numerics); Search/Create = one door two labels (E7); full state matrix except reopen-reset; combobox/listbox ARIA + kbd model (Tab pinned, Esc focus-return conditional); copy verb+object; i18n live (Aksi/Navigasi…); group-order matches source.
Findings: **D1 MED (CMDK-1)** · **D2 MED (SYS-2)** · **FLAG** desktop kbd hints render inert on phone. Step-2.5 N/A.

### chrome-deputy-panel (Dewi · 1280/390)
Clean: escape-layering contract (desktop + phone escapeCapture, both directions where testable); OD-REDESIGN-80 floating-card geometry verified deliberate; keep-mounted contract; B2 mutual-exclusion (unit-covered).
Findings: **F1 LOW (DEP-1)** · **F2 LOW** duplicate Stop during stuck-run (design call). **BLOCKER F3:** Task record panel won't close via ✕/Esc (only Back works) — out-of-surface but blocked the "record closes, Deputy untouched" direction of the coexistence proof.
**Not reviewed (live runtime absent):** ApprovalChip / QuestionChips / RatingControl / error-retry — source+unit only. Step-2.5 N/A.

### chrome-signal-composer (Dewi/Krishna · 1280/390)
Clean: naked-number census pass (fan-out "notify N" labelled); 4-door dispatch parity to one shared host; A3/E8 single mutating action; focus trap/tab order; Escape isolation (popover then composer); mention fuzzy-filter/dedup; visibility line correctness.
Findings: **F1 HIGH (SYS-1)** · **F2 MED (SYS-2, ×3)** · **F3 LOW** no loading affordance · **F4 LOW** disabled @BU no reason. Observed (tracked, not re-flagged): FLAG-4 team default, FLAG-5 datetime locale. Step-2.5 N/A.

### auth/infra 6-pack (login·recovery·profile·events·ecommerce·roastery·404)
Clean: `/ecommerce` `/roastery` fully clean stubs; login state matrix + quiet errors (AC-005); focus rings; number census zero; no destructive actions.
Findings: **F1 DEFECT (SYS-2)** back-to-X links 21–23px ×4 sites · **F2 DEFECT (SYS-5)** off-ladder fonts ×5 files · **F3 DEFECT (AUTH-1)** `/events` skipped heading. FLAGs: 404 shows Home job-sentence (ratified `job-sentences.ts:70`); 6 demo-persona buttons > A7 cap (DEV-gated). Step-2.5 N/A/by-design.

### follow-up record (Fitri · source-level, feature dark)
**Feature is entirely dark** — `SHOW_FOLLOWUPS=false` hardcoded, no env plumbing (unlike sibling `SHOW_PLAN_BUDGET`); all 4 doors redirect/placeholder. Census run source-deterministic (RecordBody order is unconditional).
Findings: **F0 HIGH/process** no env override to render for QI/audit · **Step-2.5 FAIL (FU-1):** Settlement region absent, 9/9 per-field captions, content (money) not leading · **N1 MED** Age field absent · **LOW** collection has no Toolbar though overdue-filter exists code-only; raw enum "Stage"; queue-only lifecycle. Clean: state census complete; H2 truncation clean; PIC vocab correct.

### AXIS: dark-mode (Dewi · 6 required surfaces)
**F1 CRITICAL (SYS-1)** · **F2 HIGH (SYS-3)** · **F3 MED (SYS-4)**. FLAGs: hairline dividers subtle-by-design (theme-invariant, lower contrast in *light*); Money 2-series chart colors 1.04:1 apart (theme-invariant). Verified clean: no light-surface survivors; no inline hex; Admin per-row avatars correctly dark-aware (proves app *can*); Home reason-chips retracted after fixing own alpha-compositing bug.

### AXIS: locale-id (Dewi)
**F1/F2/F3 HIGH (I18N-1)** Money/Admin-People/Kitchen-KPI un-i18n'd · **F4/F5/F8 MED (I18N-2)** raw enums on record doors · **F6/F7/F9/F10 LOW** account menu, Tasks "Card", search-clip, "Objective" loanword (decision, not code). F11 = tracked FLAG-5. Clean: number/currency/date formatting locale-aware everywhere (WIB suffix); Home/Tasks/Signals/Cmd-K/Inbox/Deputy natural Indonesian.

### AXIS: finance-persona (Fitri)
**D1 CRITICAL (SEC-1)** · **D2 HIGH (SIG-2)**. FLAGs: Money subtitle promises "act on exceptions" (no such surface); Task anatomy not content-first (tracked spec debt). Clean: rail parity exact (no Admin/Projects/Objectives; `/admin/people` correctly redirects — unlike `/cafe/*`); Money 6 combos functional; My-work scoping; profile "Managed by Admin".

---

## 3. WORK-ORDER (deduped DO / DEFER — no floating suggestions)

### DO — merge-blocking
- **DO-1 (CRITICAL, security):** Guard `/cafe` `/cafe/log` `/cafe/plan` `/cafe/stock` with the same `RequireAccessRole`/BU scope already on `/cafe/review`·`/cafe/pushes`; tighten `ops.kitchen_logs` insert/update `WITH CHECK` to require Café/Kitchen membership or `ops_lead|admin`. → `security-auditor` sign-off. (SEC-1)
- **DO-2 (CRITICAL, one token, app-wide):** Redefine `--ds-font-color-inverted` in `theme-dark.css` to a light value (it's the fixed on-brand-chip text, theme-invariant since the chips are); re-verify every consumer (avatars, primary/destructive/success buttons, checkboxes) both themes; generalize the dq-badge.css F1a pattern; consider renaming the token. (SYS-1 → top-bar D2, signal F1, dark F1)
- **DO-3 (HIGH, structural):** Give the drawer link + full-width `UserChip` + `.cm-item` + composer datetime/close/mention-row + auth back-links a shared touch class (or `data-touch-target`) with a phone `min-height:44px`; then **extend `tap-targets.css.test.ts` from a selector list to every interactive class/file** so the gap closes structurally. (SYS-2)
- **DO-4 (HIGH):** Constrain `.drawer-shell-split` to `top:var(--header-h)` (or elevate `<header>` to `z-drawer+1`) so Inbox/Deputy panels stop covering the top-bar right cluster. (TB-1)
- **DO-5 (HIGH):** Set `overflowX:visible` on the compact rail `<aside>` (or portal the tooltip out of the scroll box) so 920–1099px label disclosure paints. (NAV-2)
- **DO-6 (HIGH):** Dark-mode elevation tokens need their own formula (dark shadow color independent of `--brand-navy`, or light-inset depth) — don't `color-mix` a hue-shifting token. (SYS-3)
- **DO-7 (HIGH):** Seed `team_memberships` for org-wide-role demo personas (Fitri/Sari/Rama) **and** add a `teams.length===0` empty-state to the composer instead of a silent disabled submit. (SIG-2)
- **DO-8 (HIGH):** Wire Money, Admin-People, Kitchen KPI-strip + Log-table-headers + `action-type-seg` into the i18n catalog (`money.*`/`admin.*` blocks). (I18N-1)
- **DO-9 (HIGH, build-lane recompose):** Follow-up record: add Age field, surface the Settlement/next-action on the record door, strip the 9 per-field captions (adopt Task's `readOnlyReason:undefined` pattern), lead with Outstanding content. (FU-1, N1)

### DO — non-blocking but owed before surface LOCK
- **DO-10 (MED):** Reset Cmd-K query/active state on `open` false→true (or truly unmount). (CMDK-1)
- **DO-11 (MED):** Dedicated theme-aware "text-on-blue-tint" token for active rail pill + mention chips. (SYS-4)
- **DO-12 (MED):** Replace page-level off-ladder px with ladder tokens (login/recovery/auth-shell/demo/profile 15-16px; 404 h1 26→24); extend KIT-VOCAB-FONT scan to `src/pages/**`+`src/auth/**` incl. inline styles. (SYS-5)
- **DO-13 (MED):** Route `record-field.tsx` status control + `signal-feed-rows.tsx` attention pill + signal type-kicker through existing `t()` keys (keys already exist). (I18N-2)
- **DO-14 (MED):** Give `EmptyState` a `headingLevel` prop (or emit h2 when first content region) to stop the `/events` skip. (AUTH-1)
- **DO-15 (MED):** Change Create `aria-label`/`title` to contain "Create". (TB-3)
- **DO-16 (LOW):** Deputy ThreadList empty/loading → shared `LoadingShell`/`EmptyState`. (DEP-1)
- **DO-17 (LOW):** i18n tail — account menu, Tasks "Card" tab, composer @BU disabled reason, composer loading affordance.
- **DO-18 (BLOCKER for deputy re-verify):** fix Task record panel `close()`/`requestLeave` path (✕ and Esc don't unmount; only Back works) — see deputy F3 root-cause note (`overlay-host.tsx` / `tasks-workspace.tsx` stale-closure hazard).

### DEFER (owner-gated or out-of-generation)
- **DEFER-1:** `SHOW_FOLLOWUPS` env plumbing (mirror `VITE_SHOW_PLAN_BUDGET`) — only if live-render audits of dark features are wanted; zero prod behavior change. Owner call. (FU F0)
- **DEFER-2:** Wire impeccable `detect.mjs` into the gate + vendor skills in worktrees so Step-0's detector half runs. (battery-wide gate gap)
- **DEFER-3:** Add a dark-mode-shadow-undercorrection rule to the mechanization inventory (D-6 gap). (SYS-3)
- **DEFER-4:** Money 2-series chart colors (1.04:1 apart) + Money subtitle/reality mismatch — copy/design pass, not a merge blocker.
- **DEFER-5:** Phone bottom-tab count-badge parity — no rule requires it; owner call (see FLAG list).

---

## 4. FLAG LIST — grill-surviving NEW owner questions (one-liners)

- **FLAG-A:** Should phone bottom-tab (Work/Café) surface the same at-a-glance counts the desktop rail shows, or is count-free phone chrome intended? (nav)
- **FLAG-B:** Should `/cafe/log` be deep-linkable from every persona's Home "Failed checks" band at all, or only for Café/Kitchen roles? (finance — the door exists even after DO-1 guards the route.)
- **FLAG-C:** "Objective" stays an English loanword app-wide vs. becomes "Tujuan"/"Objektif" everywhere — pick one; today the record field says "Tujuan" while nav/title say "Objective". (locale-id F10)
- **FLAG-D:** Should the stuck-run Deputy show two "Stop" buttons (banner + composer), or collapse to one? (deputy F2 — deliberate escape-hatch vs redundancy.)
- **FLAG-E:** Should Cmd-K's desktop keyboard hints (esc / ↑↓ / ↵) render at all on the 390px touch variant? (cmdk — mockup never addressed phone width.)
- **FLAG-F:** Should the 404 fallback keep the Home job-sentence ("What needs my attention right now?") or get a 404-specific line? (auth — currently ratified, but reads oddly above "Page not found.")

*(Not re-flagged: FLAG-4 team default, FLAG-5 datetime locale — already tracked open in the register; DESIGN.md:396 top-bar user-chip line is stale vs OD-57 → doc-only edit, folded into DO backlog not a question.)*

---

## 5. REGISTER LOCK-LIST

| Surface / axis | Gen-1 battery run? | Verdict | LOCK now? |
|---|---|---|---|
| `/ecommerce` stub | yes | fully clean, both breakpoints | **LOCK** |
| `/roastery` stub | yes | fully clean | **LOCK** |
| chrome-top-bar | yes (clean-heavy) | 3 defects (TB-1 HIGH via SYS-1, TB-3) | owe DO-2/4/15 |
| chrome-nav | yes | 2 HIGH defects (SYS-2, NAV-2) | owe DO-3/5 |
| chrome-cmdk | yes (thorough) | 2 MED + 1 FLAG | owe DO-3/10 + FLAG-E |
| chrome-signal-composer | yes | 4 findings + SIG-2 (finance axis) | owe DO-2/3/7/17 |
| auth `/login` `/recovery` `/profile` `/404` | yes | SYS-2 + SYS-5 defects across them | owe DO-3/12 (+DO-14 for events) |
| `/events` | yes | AUTH-1 skipped heading + I18N | owe DO-8/14 |
| chrome-deputy-panel | **partial** — approval/question/rating/error NOT live-verified (no runtime); blocked by Task-panel close bug | cannot close gen-1 battery | **blocked** — needs live runtime + DO-18, re-run |
| follow-up record | **source-only** — feature dark, unrenderable | Step-2.5 FAIL, multiple defects | **blocked** — needs DO-9 rebuild + DEFER-1 to render, re-run |
| Money surface | axis-only (dark + locale + finance) — never had own gen-1 surface pass | heavy SYS-1/3 + I18N-1 | owe DO-2/6/8; **needs a dedicated Money surface census** |
| Admin People | axis-only | I18N-1 (fully un-i18n'd) | owe DO-8; needs dedicated surface census |
| Kitchen Café Log | axis-only (locale + finance-security touched it) | I18N + SEC-1 | owe DO-1/8; needs dedicated surface census |

**Net:** only the two content-free stubs (`/ecommerce`, `/roastery`) LOCK clean today. Everything else owes at least one DO before lock; **deputy-panel and follow-up cannot even complete their gen-1 battery** until a live agent runtime (deputy) / a rendered instance (follow-up, DEFER-1) exists and the Task-panel close bug (DO-18) is fixed. Money/Admin-People/Kitchen were only ever touched by cross-cutting axes and still owe a **dedicated surface census** on top of their axis fixes.
