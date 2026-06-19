# UI Design-Plan — Kitchen ops Module (the k3 UI slice)

**Author:** design-architect · **Date:** 2026-06-20 · **Status:** Draft for owner/Director sign-off
**Scope:** the **UI slice only** of the Kitchen ops Module. DB substrate (typed `ops.*` tables, RLS,
batch-mint RPC, outbox, worker) is already built; this plan does NOT re-decide it.
**Source spec:** `docs/specs/kitchen-module.spec.md` (FR/AC ids cited inline).
**Identity authority:** `DESIGN.md` (adopted "Quiet Control Surface"). **No new visual language is
invented here** — every component maps to an existing primitive + named `DESIGN.md`/`--ds-*` token.
**Mockup anchors (consistency obligation):**
- `docs/design-mockups/ui-revamp/mock-shell-and-table.html` — the shell (top bar + nav-only rail +
  content-header + toolbar + records-table grammar; loading/empty/error variants; dark).
- `docs/design-mockups/ui-revamp/mock-record-page.html` — two-column record page (left details panel +
  right tabbed feed) — the **review-detail** grammar.
- `docs/design-mockups/archive/mock-daily-ops-feed.html` — the **mobile capture grammar** (phone frame,
  44px touch targets, co-located submit, needs-attention tint, the Daily-Log feed row) + the
  source-badge / muted-type-text pattern the kitchen summary mirror inherits.
- `docs/reference/mos-design-kit/guidelines/ia-patterns.md` — IA/IxD measured patterns.
- Primitives kit: `docs/reference/mos-design-kit/components/` + `ui_kits/mos/` —
  `IconButton`, `Tag`, `Avatar`, `Chip`, `TextInput`, `Checkbox`, `Toggle`, `RecordTable`, `RecordPage`,
  `Sidebar`, `Kanban` (the latter not used here).

---

## 0. Primary lens (binding — read first)

**Mobile-first PWA for capture; desktop for review.** Per ADR-0010/0011 the kitchen Module is used on
**personal phones, installed as a PWA, online-only writes** (FR-004/005, NFR-008). The two write-heavy
surfaces a `member` touches all day — **Log capture** and the **upcoming-plan ("pesanan") view** — are
designed **phone-first**: thumb-reachable primary action pinned to the bottom, ≥44px touch targets,
minimal typing, fast *repeated* entry (increment semantics, FR-021). They then scale up to a wider
column on desktop, but the phone is the design origin, not an afterthought.

The **ops_lead** surfaces — **daily plan editor**, **review/approve queue**, **stock view**, **outbox /
dead-letter** — are **desktop-first** (a manager at a laptop working a queue), but must remain *usable*
(not pretty-only) on a phone because an ops_lead is often on the floor. Capture = phone-native;
review = desktop-native, phone-usable.

**Role-gating is RLS-first, UI-second (FR-003/044, NFR-002).** The SPA reads `viewer.accessRoles`
(already shipped) to *show/hide* role-gated surfaces and actions, but the UI gate is a courtesy — the
database is the authority. The plan specifies the **forbidden state** for every role-gated surface (a
`member` who deep-links to the review queue sees a clean "not available for your role" panel, never a
broken/empty table that looks like a bug).

---

## 1. Information architecture

### 1.1 Where the Kitchen Module lives in the shell

The Kitchen Module is a **Module surface inside the existing revamp shell** (top bar + nav-only rail,
`mock-shell-and-table.html`). It is **not** a competing shell. It sits as its own top-level rail entry,
grouped under a new rail group **"Kitchen"** (Module group label = the rail overline pattern,
`ia-patterns.md` "Sections": `--ds-font-color-tertiary`, 11px, weight 500, `letter-spacing .06em`,
UPPERCASE).

The first-slice rail already lists the MOS Workspace group (My Week · Tasks · Weekly updates · Daily
Log). Kitchen is a **second Module**, so the rail gains a second group:

```
WORKSPACE                 ← existing group (My Week, Tasks, Weekly updates, Daily Log)
  …
KITCHEN                   ← new Module group (this slice)
  Log                     ← member primary (capture)        nav-item, blue accent-icon when active
  Plan                    ← ops_lead (plan editor) + member read-only "pesanan"
  Review            ⦿3    ← ops_lead only (approval queue; trailing count = # Submitted)
  Stock                   ← read-only (auto-computed)
  Pushes                  ← ops_lead/admin only (outbox + dead-letter surfacing, FR-074)
```

- Each item is the standard **NavItem** (28px, `--ds-border-radius-sm`, 13px, 16px leading icon;
  active = `--ds-background-transparent-light` fill + `--ds-font-color-primary` text + icon tinted to
  `--ds-color-blue` + weight 500 + `aria-current="page"`).
- **Role-conditional rendering:** `member` sees `Log` · `Plan` (read-only "pesanan" tab) · `Stock`.
  `ops_lead`/`admin` additionally see `Review` (with the Submitted-count badge) and `Pushes`, and the
  `Plan` item opens the *editor* not the read-only view. Hidden-not-disabled in the rail (a `member`
  doesn't see Review at all); but the **route still exists** and renders the forbidden state if reached.
- **Open question OQ-1 (below):** whether Kitchen is one rail group of 4–5 items (chosen here) vs a
  single "Kitchen" rail entry that opens an in-Module view-tab strip (Log · Plan · Review · Stock). The
  revamp's view-tab strip (`vtab`, `mock-shell-and-table.html`) is the precedent for *views of one
  entity*; here the five surfaces are *different jobs*, so a rail group reads truer. Flagged for owner.

### 1.2 Screen inventory (5 surfaces + sub-states)

| # | Surface | Route (proposed) | Primary role | Serves FR / AC |
|---|---|---|---|---|
| S1 | **Kitchen Log (capture)** | `/mos/kitchen/log` | member (phone) | FR-020/021/022/023/024; AC-020/021/022/030/090/091 |
| S2 | **Daily Plan editor** + **Upcoming "pesanan"** | `/mos/kitchen/plan` | ops_lead (editor) / member (pesanan, read-only) | FR-030/031/032/035; AC-024 |
| S3 | **Review / Approve queue** | `/mos/kitchen/review` | ops_lead/admin | FR-040/041/042/043/044/050; AC-040/041/042/090/091 |
| S4 | **Stock view** | `/mos/kitchen/stock` | any authed (read-only) | FR-060/061/062; AC-031/032/033 |
| S5 | **Pushes (outbox / dead-letter)** | `/mos/kitchen/pushes` | ops_lead/admin | FR-074; (worker ACs are backend; this surface is the human-intervention seam) |
| (mirror) | **Daily Log summary** | existing `/mos/ops` feed | manager/Arief (read) | FR-090/091/092; AC-060/061 — **no new surface**, see §4.5 |

### 1.3 Navigation model (consistent with mockups + the read-vs-review distinction)

- **Capture → Review is a handoff, not a drill-in.** A member logs on S1; the log appears as `Submitted`
  on S3 for an ops_lead. There is **no record page for a single kitchen log** in v1 (unlike a Task). A
  kitchen log's lifecycle is *worked in the queue* (S3), not opened as a canonical detail page. This
  matches the spec (kitchen logs are queue items, not RACI-bearing records) and avoids inventing a
  Task-style `/tasks/:id` home the spec doesn't ask for.
- **Review uses the record-page grammar** (`mock-record-page.html`) for the *expanded* review of one
  Submitted log (left = the log's facts: item, plan-vs-logged, submitter, submit-note; right = the
  decision panel: approve/reject + note). On desktop this is a **right-side drawer**, not a full route
  change (the queue stays visible behind it — the ops_lead works a list).
- **The kitchen happening surfaces to managers ONLY via the existing Daily Log feed** (the summary
  mirror, §4.5). Kitchen does **not** add a manager-facing surface (spec §1: "Managers see the kitchen
  happening in the existing Daily Log via the summary mirror — no new surface for them").
- **Read vs review (jtbd §3.5 anchor A1) is respected:** the kitchen *log* IS reviewed (approve/reject
  lifecycle — correct, it has a status). The Daily Log summary mirror is **read, never reviewed** — it
  carries no approve/ack affordance on `/ops` (FR-091, AC-061). The plan must not let the mirror sprout
  a review verb.

---

## 2. Per-screen breakdown

> Token convention: this plan names **`--ds-*` kit tokens** (the runtime form the revamp shell uses) as
> primary, with the `DESIGN.md` semantic name in parentheses where they differ. The crosswalk is the
> revamp's (`mock-shell-and-table.html` token block). No raw hex/px decisions — every value is a token.

### S1 — Kitchen Log (capture) — `/mos/kitchen/log` — **PHONE-FIRST**

**JTBD (jtbd.md "Ops / floor user"):** *"When production/transfer just happened, I want to record it in
one short pass on my phone and get back to work."* Adapted to kitchen: fast, **repeated** entry against
today's plan, with the variance-note and transfer-availability gates inline.

**Layout — mobile (≤640px, the design origin):**
```
┌─ Kitchen · Log ───────────── [date: Today ▾] ┐   ← content-header (entity icon + title + date chip)
│ [ Production ] [ Transfer→Radiant ] [→Bungur ]│   ← action_type segmented control (seg primitive)
│                                               │
│  ▸ Today's plan for Production                │   ← collapsible plan-vs-logged context strip
│    Nasi Goreng        plan 12 · logged 8      │
│    Ayam Bakar         plan 20 · logged 20 ✓   │
│ ───────────────────────────────────────────  │
│  ACTIVE WIP ITEMS (sorted by name)            │   ← overline
│  ┌───────────────────────────────────────┐   │
│  │ Nasi Goreng         [ −  8 porsi  + ]  │   │   ← stepper row (large +/− = thumb targets)
│  │ plan 12 · stok 3 · tersedia 9         │   │   ← inline context (FR-022/023 basis)
│  │ ⚠ note required (off-plan)  [note ▾]  │   │   ← variance-note gate, shown when qty≠target
│  └───────────────────────────────────────┘   │
│  … more item rows …                           │
│                                               │
│ [+ extra item]                                │   ← off-plan add (note always required, FR-022/AC-021)
└───────────────────────────────────────────────┘
  ┌─────────────────────────────────────────┐
  │       Submit 3 lines  →                  │   ← PINNED bottom bar, 44px, btn-primary (FR-020)
  └─────────────────────────────────────────┘
```

**Layout — desktop (≥768px):** the same single content column widens to ~720px centered; the action_type
seg + plan context move to a left rail-strip within the page; the item-stepper list becomes a denser
two-column grid; the Submit bar un-pins and sits at the foot of the form. Capture is rarely done on
desktop, so this is "usable, not optimized."

**Components (→ primitive):**
- Action-type selector → **seg** segmented control (`mock-shell-and-table.html` `.seg`; `role="tablist"`).
  Three canonical values (Production · Transfer to Radiant · Transfer to Bungur — spec §2 action_type).
- WIP-item stepper row → composed from **TextInput** (numeric `qty_porsi`) flanked by two **IconButton**
  (− / +). Stepper is the phone-native qty control (minimal typing, FR-004 lens). Each row carries the
  plan/stok/tersedia context as `--ds-font-color-tertiary` meta text (`tabular-nums`).
- Variance note → **TextInput** (multiline) revealed inline when the gate fires; the field uses the
  **field-error tokens** (`--field-error-border` = destructive outline, `--field-error-text` =
  `--status-lost-text`) when required-but-empty on submit attempt (DESIGN.md §5 Inputs / OD-P3-5).
- "+ extra item" → **btn-ghost** (`--ds-font-color-secondary`); opens an item picker (active WIP items
  only, FR-011).
- Submit → **btn-primary**, 44px tall on phone (`box-shadow: brand-button`), the One-Blue action.

**Tokens:** surfaces `--ds-background-primary` / `--ds-background-secondary` (= card/secondary);
text `--ds-font-color-primary` / `-secondary` / `-tertiary` (= foreground/muted); action `--ds-color-blue`
(= primary, The One Blue); seg "on" lift `--ds-box-shadow-light`; borders `--ds-border-color-light`/
`-medium`; radii `--ds-border-radius-sm` (controls) / `-md` (cards); type DM Sans body + `tabular-nums`
on every quantity (plan/logged/stok/tersedia/qty) — **Tabular-Numbers Rule** (use the Inter-tabular
`.tabular` scope per DESIGN.md note 7, since DM-Sans `tnum` is a no-op). Touch targets ≥44px via
`.touch-target` (OD-W4-4). Needs-no warning/destructive at rest — gates are state-driven.

---

### S2 — Daily Plan editor + Upcoming "pesanan" — `/mos/kitchen/plan`

**JTBD:** ops_lead — *"set what we plan to make/transfer per item per day, fast, replace-as-I-go."*
member — *"see what's coming the next two weeks so I know what to produce"* (read-only).

**Two modes on one route, role-gated:**
- **`ops_lead` → editor mode.** A `RecordTable`-style grid for the selected date: rows = active WIP
  items × action_type, the editable cell = `qty_porsi`. Save is **upsert/replace** (FR-031) — editing a
  cell PATCHes the plan row; a quiet "saved" toast confirms (no view transition; jtbd "change-in-place").
- **member → "pesanan" read-only mode.** The next **14 days** (FR-035, `PESANAN_HORIZON_DAYS`) of
  planned (date · item · action · planned_qty), read-only, **no logging/approve affordance** (AC-024).
  This is a grouped read-only `RecordTable` (group-by date).

**Layout:**
- Desktop: content-header (`Plan` + date stepper) → toolbar (date prev/next chips + a "today" reset) →
  the grid. Editor cells are inline-editable (`.val.editable` hover from `mock-record-page.html`).
- Mobile: the grid collapses to the **DataTable card-reflow** (OD-W4-4, 768px breakpoint) — one card per
  (item, action), the editable qty as a stepper. Editing on phone is supported but desktop is the home.

**Components:** **RecordTable** (grid); **TextInput**/stepper (editable qty cell); date stepper =
two **IconButton** + a label; **seg** to switch action_type filter; group-header rows for the pesanan
view (`mock-shell-and-table.html` group-header grammar — hairline, caret, label `--ds-color-blue12`/
brand-navy-text, count `tabular-nums`).

**Tokens:** as the records-table (S3/shell anchor). Date + qty `tabular-nums`. Read-only "pesanan"
rows show **no** hover-checkbox and **no** row menu (read-only ≠ editable — the absence is the signal).

---

### S3 — Review / Approve queue — `/mos/kitchen/review` — **DESKTOP-FIRST, `ops_lead`/`admin` only**

**JTBD:** ops_lead — *"work the Submitted logs for today: see plan-vs-logged, approve or reject with a
note where required, finish Production before Transfers, bulk where I can."* This is the **GIGO gate**.

**Layout — desktop:**
```
┌─ Kitchen · Review ─────────────── [date ▾]  ⦿ 3 Submitted ┐  ← content-header + count chip
│  [ Production (3) ] [ Transfer→Radiant (1) ] [ →Bungur ]   │  ← action_type group tabs
│ ──────────────────────────────────────────────────────────│
│  PRODUCTION                       [ ✓ Approve all (3) ]     │  ← group header + BULK approve (FR-043)
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ☐ Nasi Goreng   plan 12 · logged 8   Budi S.  09:12   │ │  ← RecordTable row: plan-vs-logged
│  │   "kurang bahan" (submit note)        [Approve][Reject]│ │     + submitter Avatar + inline actions
│  │ ☐ Ayam Bakar    plan 20 · logged 20 ✓ Dina   09:40    │ │
│  └──────────────────────────────────────────────────────┘ │
│  TRANSFER → RADIANT     ⓘ blocked until Production approved │  ← production-first gate banner (FR-042)
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ☐ Cold Brew     plan 40 · logged 42   Budi   13:02    │ │     [Approve] disabled + tooltip; [Reject] live
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
   → clicking a row opens the REVIEW DRAWER (record-page grammar) for the full decision.
```

**Review drawer (record-page grammar, `mock-record-page.html`):** right-side drawer over the queue.
Left details panel = the log's facts (WIP item identity, action_type Tag, **plan vs logged** with the
variance delta, submitter Avatar + name, submitted-at, submit note). Right = the **decision panel**:
Approve / Reject buttons + a **review-note TextInput** that becomes *required* (field-error tokens) when
(a) Reject, or (b) approved-qty deviates from plan (FR-041, AC-040/041). On Approve, a quiet confirm
("Approved · batch PR-20260620-003") shows the minted `batch_id` (FR-050) in **mono** (Mono-For-IDs).

**Interaction gates (FR-042/043):**
- **Production-first:** while any Production log for the date is still Submitted, every Transfer
  `Approve` (single + bulk) is **disabled** with a tooltip "Finish Production approvals first."
  **Reject stays live** (spec: Reject always allowed). The gate is shown as a calm `ⓘ` banner on the
  Transfer group header (`--ds-font-color-tertiary` + a quiet info glyph), never an alarm color.
- **Bulk approve** is a group-header **btn-primary**; it respects the production-first gate.

**Components:** **RecordTable** (queue rows); **Checkbox** (row select, hover-revealed, indeterminate
"select all" — kit Checkbox + RecordTable patterns); **Tag** (action_type + a derived variance Tag:
on-plan = `tag.done` green tint, off-plan = `tag.prog` amber tint — the Tinted-Status pattern, dot +
text, never color-alone); **Avatar** (submitter, `av-sm`); **IconButton** (row ⋯); **btn-primary** /
**btn-ghost** (approve/reject); the drawer reuses **RecordPage** two-column grammar; review-note =
**TextInput**.

**Tokens:** records-table tokens (shell anchor); variance Tags use `--ds-tag-background-{green,amber}` +
`--ds-tag-text-{green,amber}`; the production-first banner = `--ds-font-color-tertiary` info text (NOT
warning/destructive — it's a sequencing rule, not an error); minted batch_id = `--ds-code-font-family`
(SF Mono). All quantities `tabular-nums`.

---

### S4 — Stock view — `/mos/kitchen/stock` — read-only, auto-computed

**JTBD:** *"what's usable in the kitchen right now / at end of a date?"* — a glance, not an edit surface.

**Layout:** a single read-only `RecordTable` for the selected date: rows = WIP item, columns = item ·
`usable_qty` (the auto-computed net, FR-060) · a small derivation hint (`+Prod −Transfers`). Two cuts
exposed via a **seg** (Start-of-day / End-of-day, FR-061) — defaulting to End-of-day (the stored
balance). **Negative balances are preserved and shown in `--ds-color-red` / destructive text** (FR-061,
AC-032) — they surface a real data issue; do not clamp. An ESB-inventory comparison column shows `—`
(deferred per spec out-of-scope) with a tooltip "ESB reconciliation deferred."

**Components:** **RecordTable** (read-only — no hover-checkbox, no row menu); **seg** (the two cuts);
**Tag** is NOT used (stock is numeric, not status). Mobile → DataTable card-reflow.

**Tokens:** records-table; `usable_qty` `tabular-nums`; negative = destructive text (`--ds-color-red`);
the `—` ESB column = `--ds-font-color-light`. No editable affordances anywhere (read-only is the signal).

---

### S5 — Pushes (outbox / dead-letter) — `/mos/kitchen/pushes` — `ops_lead`/`admin` only

**JTBD:** ops_lead — *"a push failed; what's stuck, why, and what do I do?"* This is the **human seam**
for FR-074's dead-letter surfacing (the worker dead-letters after MAX_RETRY; an ops_lead must see it).

**Layout:** a `RecordTable` of `integrations.esb_push` rows the ops_lead can READ (RLS allows ops_lead
read of its org's push rows, AC-007). Columns: batch_id (mono) · endpoint · `target_env` Tag (`goo` /
`dry_run` / `gkid`) · status Tag (pending / in_flight / posted / failed / **dead_letter**) ·
`retry_count` · `last_error` (truncated, expand on click) · `esb_doc_num` (mono, when posted) ·
created/posted times. **Dead-letter rows** get the needs-attention treatment from the ops-feed mockup
(`warning/7%` fill + 2px `--ds-color-amber` left rule — the one owner-approved side-stripe exception,
DESIGN.md MOS-density §"Ops Log tokens"). **No write actions in v1** — the ops_lead reads & escalates;
the manual reset path is an open question (spec §10 OQ-4). A read-only "Couldn't post — escalate to
platform" hint sits on dead-letter rows.

**Components:** **RecordTable**; **Tag** (target_env + status, Tinted-Status); mono IDs; the
needs-attention row treatment (warning tint + 2px left rule + text — never color-alone, WCAG 1.4.1).

**Tokens:** target_env Tag — `goo` = neutral `badge-status` (secondary + muted), `dry_run` = neutral,
`gkid` = `--ds-tag-background-blue` (a calm "this is the live target" mark, not an alarm); status Tag —
posted = green, failed = amber, dead_letter = red dot + amber-tinted row (attention, not destructive
fill); `last_error` text = `--ds-font-color-tertiary`. **OQ-5:** is `Pushes` an ops_lead surface or
admin-only? Flagged.

---

## 3. All states (every surface)

| State | S1 Log | S2 Plan/pesanan | S3 Review | S4 Stock | S5 Pushes |
|---|---|---|---|---|---|
| **Loading** | skeleton item rows (stepper-shaped); seg + header stay | skeleton grid rows | skeleton queue rows (`aria-busy`) | skeleton table rows | skeleton table rows |
| **Empty** | "No active WIP items configured — ask an ops lead" (FR-011) | editor: "No plan for {date} — add items"; pesanan: "Nothing planned in the next 14 days" | "No Submitted logs for {date} — nothing to review ✓" (a *good* empty) | "No approved activity for {date} yet" | "No pushes yet" / "No failed pushes ✓" |
| **Error** | inline "Couldn't load items — Retry"; seg stays usable | "Couldn't load plan — Retry" | "Couldn't load the queue — Retry" | "Couldn't compute stock — Retry" | "Couldn't load pushes — Retry" |
| **Populated** | item steppers + plan context | grid / 14-day grouped list | grouped Submitted queue + drawer | net table (two cuts) | push rows + dead-letter attention |
| **Role-forbidden** | n/a (member surface) | member hitting editor route → read-only pesanan (graceful downgrade, not a wall) | member deep-link → **"Review is available to ops leads only"** panel (clean, with a "Back to Log" btn) — NOT an empty table | n/a (all roles read) | member/manager → same forbidden panel |
| **Offline / write-blocked** (online-only, FR-005/NFR-008) | Submit disabled + a persistent banner "You're offline — logging needs a connection. Your entries are kept on screen; reconnect to submit." **No silent local queue.** | Save disabled + same banner | Approve/Reject disabled + banner | n/a (read; cached read shows a "stale, reconnect to refresh" note) | n/a (read) |
| **Optimistic vs confirmed** | **NOT optimistic** — a Submit shows a spinner on the button, then a confirmed toast. The GIGO gate means a member must never believe a log "counted" before the server accepts it (NFR-008 rationale). | Save = quiet confirmed toast after server ack (upsert is idempotent, but show confirmed state) | Approve = confirmed only (it mints batch_id + enqueues + mirrors atomically, spec §6 atomicity row) — show the minted batch_id *after* server confirm, never before | n/a | n/a |

**Forbidden-state copy is deliberate (jtbd anchor A3 lesson):** a role-gated empty must read as *intent*
("not for your role"), never as a *bug* (a blank table). RLS may already return zero rows; the UI must
name the reason.

---

## 4. Interaction design (IxD)

### 4.1 Fast-capture flow (S1, the core loop, FR-020/021/022/023)
1. Member opens Log → action_type defaults to **Production**, date defaults to **today (WIB)** (NFR-007).
2. Plan context shows plan-vs-logged per item so the member knows the target at a glance.
3. Member taps `+` on an item's stepper (or types) → qty fills.
4. **Variance-note gate (FR-022):** if qty ≠ effective target (`max(plan − stock, 0)`) — including any
   off-plan "+ extra" — a **note field reveals inline** and Submit stays blocked for that line until a
   note is entered. The cue is the field-error token pair, plus a one-line "Catatan wajib — di luar
   rencana" helper (ID content, NFR-012). (AC-020/021)
5. **Transfer-availability gate (FR-023):** for Transfer action_types, if a line's qty exceeds available
   stock (`tersedia`), the stepper caps and shows "Stok kurang — produksi dulu" ("produce first"); a
   multi-line submit of the same item is capped at the available total, not bypassed. (AC-022)
6. **Submit** → all valid lines insert as `Submitted`, `submitted_by` server-stamped (FR-020, NFR-003).
   **Increment semantics (FR-021):** a second submit of the same item *adds* — the UI never implies
   "you already logged this, overwrite?" — repeated entry is the expected, frictionless path. (AC-030)
7. Confirmed toast: "3 lines submitted — pending review." The lines clear; the member can log again.

### 4.2 Approve / reject flow (S3, FR-040/041/044/050)
1. ops_lead opens Review for a date → Submitted logs grouped by action_type, plan-vs-logged inline.
2. **Single decision:** click a row → review drawer → Approve or Reject.
   - Reject **always requires a note** (FR-041, AC-041).
   - Approve requires a note **only when approved-qty deviates from plan** (FR-041, AC-040).
3. **Production-first gate (FR-042):** Transfer Approve disabled while any Production log is Submitted;
   Reject of a Transfer stays allowed. (AC-042)
4. **Bulk approve (FR-043):** group-header "Approve all (N)" — same gate; shows a single confirmed toast
   with the batch range.
5. On Approve, the server (already built) mints batch_id, recomputes stock, enqueues the push, writes
   the Daily-Log mirror — **atomically**. The UI shows the confirmed batch_id only **after** server ack
   (no half-approve illusion; spec §7 atomicity row).

### 4.3 Validation & confirmations
- **Validation is inline-on-attempt**, mirroring the create-task form (OD-P3-4): the note gate fires on
  Submit/Approve attempt, the field-error tokens mark the offending field, focus moves to it.
- **Routine writes confirm quietly** (toast), per the ui-implementer invariant. The **only** consequential
  confirm-dialog is none in v1 (no hard delete exists — soft-archive only; spec out-of-scope). Reject is
  a routine queue action (note + click), not a destructive confirm.

### 4.4 Daily-Log mirror surfacing (FR-090/091/092, AC-060/061)
The kitchen happening surfaces to managers in the **existing `/mos/ops` Daily Log feed** as a summary
row (`origin = 'kitchen'`, `event_type = 'production'`, Kitchen-and-Bar source badge). It reuses the
**exact ops-feed row grammar** (`mock-daily-ops-feed.html`): **source badge** = Kitchen
(`primary/10%` + `--status-open-text`), **type** = muted text "Production", the one-line title
("Production: 12 portions Nasi Goreng approved"), `tabular` time. **It carries no approve/ack/review
verb** (FR-091, AC-061; jtbd anchor A1 — read, not reviewed). This requires **zero new UI** — it is the
ops feed rendering a new `origin`. The kitchen UI slice's only obligation is **not to add** a competing
manager surface and **not to attach** a review affordance to the mirror row.

### 4.5 PWA install
Standard install prompt (ADR-0010). The shell already hosts the app; the kitchen Module declares the PWA
manifest scope. Install affordance is a quiet one-time banner on first Log visit on a phone — out of the
visual-design critical path, noted for the implementer.

---

## 5. Responsive (explicit breakpoints — inherits the revamp's two breakpoints)

The revamp defines **two** breakpoints (DESIGN.md Navigation / OD-W4-4): **920px** rail collapse, **768px**
DataTable→card reflow. The kitchen Module adds a **640px** capture breakpoint for the phone-first forms.

| Width | Shell | S1 Log (capture) | S2/S3/S4/S5 (tables) |
|---|---|---|---|
| **≥920px** (desktop) | full rail + top bar | centered ~720px form, un-pinned submit | full `RecordTable` |
| **768–919px** (tablet) | rail collapses → hamburger; ⌘K → icon | same as desktop form | `RecordTable` still (768px is the table threshold) |
| **<768px** (phone) | hamburger; user name/role hide | **phone-first stepper list, pinned 44px Submit bar** | DataTable **card-reflow** (one card per row; `<dl>` label:value; 12px radius + resting lift; ≥44px touch targets) |
| **<640px** (small phone) | as above | single-column steppers, full-width controls | as above |

**One branch in the DOM at a time** (OD-W4-4 `useIsDesktop()` synchronous read — no flash, no
`aria-hidden` double-render). Capture's pinned submit bar uses safe-area inset padding (notch phones).

---

## 6. Accessibility (WCAG-AA)

- **Touch targets (capture, the priority):** every primary affordance on phone ≥44×44px — stepper
  +/− IconButtons, Submit, Approve/Reject, action_type seg buttons. `.touch-target` utility (OD-W4-4).
- **Focus:** the global `*:focus-visible { outline: 2px solid var(--ds-color-blue); outline-offset: 2px }`
  (= ring) on every focusable element (DESIGN.md a11y). **Focus order** follows DOM: top bar → rail →
  content-header → toolbar/seg → form/queue → pinned submit. The review drawer **traps focus** while
  open and **`Esc` closes** it (DESIGN.md flags overlay focus-management as a build-time gap — call it
  out explicitly here: the implementer MUST add focus-trap + Esc to the review drawer).
- **Labels:** every IconButton (stepper +/−, row ⋯, date prev/next) carries an `aria-label`
  ("Increase Nasi Goreng quantity", "Previous date"). The qty stepper TextInput has a visible+programmatic
  label. The action_type seg = `role="tablist"`/`role="tab"`/`aria-selected`, roving tabindex.
  Checkboxes = `role="checkbox"` + `aria-checked` (incl. mixed/indeterminate for select-all) + tabindex.
- **Contrast (cite tokens):** body `--ds-font-color-primary` on `--ds-background-primary` ≈ AAA; meta
  `--ds-font-color-tertiary` clears AA for secondary text; **all status Tags use the AA-darkened text
  tokens** (`--ds-tag-text-{green,amber,red,blue}` = the `--status-*-text` darkened variants) — never the
  base status hue as pill text; the variance/error helper text uses `--field-error-text`
  (`--status-lost-text`, AA-safe), never base destructive (which fails AA as small text). The
  needs-attention/dead-letter row pairs the warning tint with **text + a 2px rule**, never color-alone
  (WCAG 1.4.1). The production-first banner communicates via the `ⓘ` glyph + text, not color.
- **Keyboard for the desktop review surface (S3):** the queue is fully keyboard-operable — arrow/Tab
  through rows, Space to select, Enter to open the review drawer, the drawer's Approve/Reject are
  buttons in tab order, the note field is reachable, Esc closes. Bulk-approve is a focusable button.
- **Status never by color alone:** action_type, variance, push-status, dead-letter all carry a text label
  (Tinted-Status: dot + text), satisfying 1.4.1 when color is unavailable.
- **`aria-busy`** on loading tables; **live-region** announce for the confirmed-submit and
  approve toasts so a screen-reader user hears "3 lines submitted" / "Approved, batch PR-20260620-003".

---

## 7. Shell dependencies + build sequencing

### 7.1 Shell dependencies this UI takes on the **in-flight** revamp (flag every wait)

The revamp is **mid-flight** (`docs/ui-revamp-status.md`): PR #42 (top bar + nav-only rail) is **merged**;
PR-2 (records table) is **in progress**; the surface-by-surface revamp build (a–e), the kebab-case
codemod, and the UI-revamp ADR are **queued**, and the **owner mockup sign-off (#35) is still the gate**.
Consequences for the kitchen UI:

| # | Dependency | Status | What waits |
|---|---|---|---|
| **D1** | **Rail Module-group pattern** — a *second* rail group ("Kitchen") below "Workspace". The merged rail (#42) shows a single Workspace group; a multi-group rail with per-group role-conditional items is **not yet built**. | **NOT settled** | The kitchen rail entries (§1.1) cannot be added until the rail supports >1 group + role-conditional items. **This is the #1 blocker** — until it lands, kitchen surfaces have no nav home. |
| **D2** | **`RecordTable` primitive (PR-2)** — S2/S3/S4/S5 all build on the records-table grammar (sticky overline `th`, hover-checkbox, 50px dense rows, card-reflow). | **IN PROGRESS** (PR-2) | All four table surfaces wait for PR-2 to merge + stabilize. Build kitchen tables *after* PR-2 lands so they inherit, not fork, the table. |
| **D3** | **DataTable card-reflow (OD-W4-4)** — the 768px table→card single-render. | Part of the revamp table work | S2/S4/S5 mobile views depend on it; S3 queue mobile depends on it. |
| **D4** | **Review drawer = record-page grammar (revamp item b)** — the hybrid record page (drawer → expand → two-column) is a **queued** revamp build, not yet shipped. | **NOT built** | S3's review drawer should reuse the revamp's `TaskSurface`/drawer once it exists; until then S3 can ship with the **queue + inline approve/reject** (no drawer) as a first cut, adding the drawer when the revamp's record-page lands. |
| **D5** | **`viewer.accessRoles` in the SPA** — role-gating reads this. | **SHIPPED** (per task brief) | No wait — role-gated rendering + forbidden states can be built now. |
| **D6** | **⌘K command menu (revamp item d)** — kitchen surfaces should be navigable/searchable via ⌘K (Navigate group). | **NOT built** (queued) | Nice-to-have, not a blocker; kitchen nav entries register with ⌘K when it ships. |
| **D7** | **kebab-case codemod + named-exports + `@/` alias lint** | #34 queued; codemod queued | The ui-implementer must author kitchen components in **kebab-case filenames, named exports, `@/` imports, no hardcoded colors** from day one (lint enforces; `docs/ui-revamp-status.md` gotchas). Not a wait — a constraint. |

### 7.2 Recommended build order for the ui-implementer

1. **WAIT for the owner mockup gate (#35) + PR-2 (RecordTable) to merge.** Do not start kitchen tables
   on a forking table primitive.
2. **S1 Kitchen Log (capture)** — buildable **earliest** of the kitchen surfaces: it's form-based, not
   table-based, so it depends least on PR-2 (D2). Depends on D1 (rail group) for its nav home and D5
   (roles — but Log is the member-default, low gating). Build phone-first.
3. **S2 Plan / pesanan** — after D2 (RecordTable) + D3 (card-reflow). Editor + read-only pesanan.
4. **S3 Review queue** — after D2; ship **first cut without the drawer** (inline approve/reject), add the
   review drawer when D4 (revamp record-page) lands. Highest role-gating (D5) + most interaction.
5. **S4 Stock** — after D2; read-only, low risk.
6. **S5 Pushes** — after D2; read-only, depends on the worker actually producing rows to render real
   data; can use seeded `integrations.esb_push` rows for the state matrix in the interim.
7. The **Daily-Log mirror** (§4.4) needs **no kitchen-UI build** — it's the ops feed rendering a new
   `origin`. The only kitchen-UI obligation is the negative one: don't add a manager surface, don't
   attach a review verb to the mirror row.

Each surface = its own PR + a `design-reviewer` 4-lens pass (CLAUDE.md). S1 and S3 are the
Product/Intent-lens-heavy ones (the capture job and the read-vs-review/forbidden-state discipline).

---

## 8. DESIGN.md token gap analysis

**No new visual language is needed. No genuine token gap was found** — every kitchen component maps to an
existing primitive + token:
- Capture steppers → IconButton + TextInput + the seg control (existing).
- Variance/transfer gates → the **field-error tokens** (`--field-error-border` / `--field-error-text`),
  already ratified (OD-P3-5) for exactly this inline-validate pattern.
- action_type / variance / push-status / target_env → the **Tag** primitive + Tinted-Status tokens.
- Dead-letter / needs-attention rows → the **owner-approved 2px warning left-rule + tint** exception
  (DESIGN.md MOS-density "Ops Log tokens") — reused, not invented.
- Kitchen Daily-Log source badge → the existing `Kitchen and Bar = primary/10% + --status-open-text`
  ops-feed token (DESIGN.md MOS-density "Ops Log tokens") — already defined.

**One token-naming note for owner awareness (not a gap, a confirmation):** the spec's `target_env`
states (`goo` / `dry_run` / `gkid`) on S5 are rendered with existing neutral/blue Tag tokens — `gkid`
(live target) deliberately gets the calm `--ds-tag-background-blue`, **not** a destructive/alarm color,
to avoid implying error. If the owner wants `gkid` to read as "caution — this is production," that would
be a **token-usage decision** (reuse warning/amber), not a new token — flagged as OQ-6. No `DESIGN.md`
edit is proposed.

---

## 9. Open questions for the Director / owner

1. **OQ-1 (IA shape):** Kitchen as a **rail group of 5 items** (chosen here) vs a **single rail entry +
   in-Module view-tab strip** (Log · Plan · Review · Stock). Rail-group reads truer because the five are
   *different jobs*, not views of one entity — but the owner may prefer the tighter single-entry shape.
2. **OQ-2 (route namespace):** `/mos/kitchen/*` proposed. Confirm — the spec says the app ships at
   `/mos`; the Module sub-namespace (`/kitchen/…`) is a UI/routing decision the spec doesn't fix.
3. **OQ-3 (S5 Pushes audience):** is the outbox/dead-letter surface **ops_lead** (chosen — they work the
   floor and feel the failures) or **admin-only** (it's plumbing)? RLS allows ops_lead read (AC-007), so
   ops_lead is viable; owner picks the audience.
4. **OQ-4 (dead-letter action, ties to spec §10 OQ-4):** v1 makes S5 **read-only** (read & escalate). Is
   a manual "retry / reset" affordance wanted in this slice, or deferred? Affects S5's action set.
5. **OQ-5 (stock cut default):** S4 defaults to **End-of-day** (stored balance). Confirm — or default to
   Start-of-day if the at-a-glance job is "what can I transfer right now."
6. **OQ-6 (`gkid` Tag tone):** render the `gkid` target_env Tag as **calm blue** (chosen — avoids false
   alarm) or **caution amber** (signals "live production")? A token-usage choice, no new token.
7. **OQ-7 (capture date scope):** S1 defaults to **today** and the spec's logging is "today (WIB)"
   (FR-020). Confirm members can **only** log today (no backdating) — the editor (S2) allows any date but
   logging is today-only per the oracle. The UI hides the date stepper on S1 if today-only is confirmed.
8. **OQ-8 (i18n at capture):** the oracle's operator copy is Indonesian ("Catatan wajib", "Stok kurang").
   NFR-012 says "EN chrome / ID content." Confirm the gate/helper microcopy on S1 is **ID** (kitchen
   staff language) while nav/headers stay EN.

---

*Ends. This plan is the per-issue design anchor for the kitchen UI (k3) slice; it references the
owner-picked Phase-0 mockups above and adds no new visual vocabulary. Hand to ui-implementer only after
the shell dependencies in §7.1 (esp. D1 rail-group + D2 RecordTable) settle and the owner clears the
open questions in §9.*
