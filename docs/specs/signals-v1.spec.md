# Spec — Signal v1 (redesign buildout Step 4)

**Status:** DRAFT for the Step-4 full grill + owner walkthrough (`docs/plans/2026-07-14-redesign-buildout.md`
row 4). **Domain law is CLOSED** (OD-REDESIGN-1..55 + Buildout OD-56..67); this spec *derives* from it and
never reopens it. Every genuinely-ambiguous schema / RLS / visibility / fan-out edge is resolved to the
**most conservative, fail-closed** option and tagged `RATIFY-BEFORE-MERGE:` inline (collected in §8).

**Authority chain:** `CONTEXT.md` (Signal glossary — the object's meaning) → `docs/decisions.md`
OD-REDESIGN-33..51 / 59 → `docs/adr/0025-…redesign-direction.md` D20–D37 → `docs/experience-contract.md`
Rules 1–12 → `SALVAGE-INVENTORY.md` (convergence-flows owns the composer/feed grammar — PORT, do not
re-invent, Rule 11). Reference impl: `convergence-flows/flows.js` (`sigComposer` / `sigCard` /
`viewSignals` / `visibilityLine`) + `e7-data.js` (Team/Site/capability model).

---

## 1. Overview

A **Signal** is a real-time, attributable, factual note that *something happened or was observed*
anywhere in Gordi. It has **no PIC, Supervisor, due date, or work Status** — mentions nudge through Inbox,
required action becomes a *linked Task*, a failed Check remains an Exception (OD-33 / D20). Signal
**supersedes** the retired mandatory Weekly Update and the operations-only Daily Log; those entry points
are removed here while their historical **data is preserved** (§7).

Step 4 delivers: the `mos.signals` write model + fail-closed RLS; the minimal **Team substrate** the model
requires (RATIFY-1); the capture-minimal **FB-style composer**; **mention grant + fan-out**; the **Home
ambient feed** (Q1, OD-59 — provisional, RATIFY-7); the **Work → Signals archive/search** surface; the
**Signal record page** (correct · retract · acknowledge · comment · Create/Link follow-up Task); and
retirement of the legacy update/log entry points.

**The Step-4 job sentences** (Rule 1): Home = "What needs my attention right now?" (feed is the *ambient*
region below the attention brief); Work → Signals = "Search and revisit the Signals your Teams have
shared." Composer verb+object action = **"Share Signal"** (Rule 7; never a bare `Create`).

### In scope
- `mos.signals` + `mos.signal_mentions` + `mos.signal_acknowledgements` + `mos.signal_revisions` +
  `mos.signal_tasks`; the `'signal'` `entity_type` added to the existing `mos.comments` (reuse).
- Minimal `shared.teams` / `shared.sites` / `shared.team_memberships` substrate + a BU
  `signal_visibility_rank` (seed migration; admin CRUD is out of scope — OD-52).
- Capture-minimal composer (content + owning Team + occurrence time + author); `@`=Person/Team/BU fuzzy
  grouped picker with type badges; Site = derived location pill (never a mention target — D37); attention
  FYI-default tap-to-raise; **category post-capture on the posted card**.
- Mention **access grant** (row-level) + **notification fan-out** (dedup, previewed count, capped).
- Home ambient feed; Work → Signals archive/search; Signal record page with correction/retraction
  revisions, acknowledge, comments (reused thread), and the **Create follow-up Task / Link existing Task**
  many-to-many bridge (reuses the canonical Task composer — Rule 11).
- Wire the existing ⌘K/FAB **Share Signal** command (`command-menu` `a-signal`, today a no-op) + retire
  legacy update/log entry points; preserve legacy data.

### Non-goals (explicitly deferred — do NOT fail these in review)
- **Home attention brief from real queries** (overdue / due-today / failed checks / mentions) → **Step 5**.
  Step 4 renders the feed as the *ambient* region; the attention region stays the current placeholder.
- **Occurrence-as-tasks / Process Runs** → **Step 6** (OD-58).
- **Admin CRUD** of Teams / Sites / visibility layers / capability grants (OD-52) → later Admin step. v1
  configures them by **seed migration** (as `business_units` were).
- **Deputy dictation** into the composer, and **deputy category/attention suggestion** (D28/D29) → deputy
  stack. v1 composer is type-only; category is manual.
- **Auto-emitted Signals** from published Process/Standard rules (D30 #3) and **"Share as Signal" from a
  canonical record** (D30 #2) → deferred; v1 `source = 'human'` only. Columns exist, stay unused.
- **Generated period views / weekly summaries** (D34) → deferred.
- **Urgent PWA/doorbell delivery** (D29) → deferred; Urgent affects ordering/treatment only in v1.
- **Free-form tags** and **BU subcategory management** (D28) → deferred; the 8 system families only.
- **Confidential-case channel** (D23/OD-37) → separate future workflow. v1 offers **no** Restricted Signal
  mode; a pre-save sensitivity warning is deferred (optional, RATIFY-none — see §8 note).
- **Followers / Follow-Unfollow** on Signals (D33) → deferred; v1 notifies author + explicit mentions.

---

## 2. Data model

All ids `uuid`; timestamps `timestamptz` UTC; schema `mos` for Signal tables, `shared` for the org
substrate. Every business table: `org_id` defaulted from `shared.current_org_id()` and **RLS
enabled + forced**. No `DELETE` grant anywhere (soft-retract only — matches `mos.tasks` / `mos.follow_ups`).
Migrations reversible (manual DOWN at file foot; pre-prod `supabase db reset`).

### 2.1 `shared.teams` — the concrete operating group under one BU (NEW · RATIFY-1)
> OD-50/53: Team is below BU; a Signal belongs to one **Team** and derives BU/Site. Today's
> `shared.business_units` already holds the **BU** layer (Marketing, HR, Finance, Retail Ops, B2B Ops,
> B2B Sales); the **Team** layer has no table. Anchoring Signal to a BU would re-bake the exact "BU=Team"
> conflation OD-50 corrected (RATIFY-1 in §8).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null → `shared.orgs` | default `shared.current_org_id()` |
| `business_unit_id` | uuid not null → `shared.business_units` | the parent BU |
| `site_id` | uuid null → `shared.sites` | central/cross-site Teams have none (OD-50) |
| `name` | text not null | e.g. "Gordi HQ Operations" |
| `code` | text not null | stable name-independent key; `unique(org_id, code)` |
| `archived_at` | timestamptz null | soft-retire |
| `created_at`/`updated_at` | timestamptz not null default now() | `set_updated_at` trigger |

Seed (mirrors `e7-data.js`, RATIFY): HQ Operations · Radiant Operations · Ecommerce Team (→ Retail Ops);
Roastery Team (→ B2B Ops); one central Team per remaining BU. Indexes: `(org_id)`, `(business_unit_id)`,
`(org_id) where archived_at is null`.

### 2.2 `shared.sites` — physical branch (NEW · minimal)
`id` · `org_id` · `name` · `code` (`unique(org_id, code)`) · `archived_at` · timestamps. Seed: Gordi HQ ·
Radiant · Roastery.

### 2.3 `shared.team_memberships` — effective-dated Person↔Team (NEW)
> Drives **owning-Team read**, **`@Team` fan-out**, and the **author's allowed owning Teams**.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null → orgs | default current_org_id |
| `person_id` | uuid not null → `shared.people` | |
| `team_id` | uuid not null → `shared.teams` | |
| `is_primary` | boolean not null default false | default composer Team |
| `effective_from` | date not null default current_date | |
| `effective_to` | date null | NULL = active |
| `created_at` | timestamptz not null default now() | |

"Active membership at now" = `effective_from <= current_date AND (effective_to IS NULL OR effective_to
>= current_date)`. Partial-unique one primary per person: `unique(person_id) where is_primary and
effective_to is null`. Indexes: `(team_id)`, `(person_id)`.

### 2.4 `shared.business_units` delta — visibility rank (RATIFY-2)
Add nullable `signal_visibility_rank int` (NULL treated as **0** = lowest, "Operations"). Higher rank =
broader default upward reach (OD-36 example Operations `0` < Marketing/support `1` < Finance/control `2` <
Management `3`). **Default: every BU rank NULL/0 → NO cross-BU reach ships until an admin sets ranks
(fail-closed).**

### 2.5 `mos.signals` — the factual record (NEW · core)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null → orgs | default `current_org_id()` |
| `author_id` | uuid not null → people | default `current_person_id()`; **immutable** (D31/OD-45) |
| `owning_team_id` | uuid not null → `shared.teams` | **immutable after post** (D31); BU/Site derive via join, never stored (CONTEXT "no duplicated BU/Site fields") |
| `occurred_at` | timestamptz not null | correctable |
| `body` | text not null `check (btrim(body) <> '')` | the single capture field; UI derives a display heading from the first line |
| `attention` | text not null default `'FYI'` `check in ('FYI','Needs attention','Urgent')` | never Status (D29) |
| `category` | text null `check (category is null or category in (…8 families…))` | NULL = **Uncategorised**; post-capture enrichment (D28) |
| `source` | text not null default `'human'` `check in ('human','shared_record','rule')` | v1 = `'human'` only |
| `source_ref` | jsonb not null default `'{}'` | canonical-record / rule provenance (unused v1) |
| `retracted_at` | timestamptz null | tombstone (D31) |
| `retract_reason` | text null | required when `retracted_at` set (trigger) |
| `edited_at` | timestamptz null | "Edited" indicator; set by correction trigger |
| `created_at`/`updated_at` | timestamptz not null default now() | |

System category families (D28): `Supply/vendor` · `Equipment/facility` · `Inventory/availability` ·
`Quality` · `Customer` · `People` · `Process` · `Other`. Indexes: `(org_id)`, `(owning_team_id)`,
`(occurred_at desc)`, `(attention)`, `(category)`, `(author_id)`, `(org_id) where retracted_at is null`.

### 2.6 `mos.signal_mentions` — access grant + fan-out audit (NEW)
> A mention is **both** a row-level access grant **and** an intentional Inbox nudge (D24/OD-38). This
> table is the grant RLS reads and the fan-out audit.

`id` · `org_id` · `signal_id` (→ signals, on delete cascade) · `mention_kind` `check in ('person','team','bu')` ·
`target_person_id` null → people · `target_team_id` null → teams · `target_bu_id` null → business_units ·
`created_at` · `revoked_at` timestamptz null (mention removal — D31). **CHECK: exactly one `target_*`
matches `mention_kind`.** Indexes: `(signal_id)`, `(target_person_id)`, `(target_team_id)`,
`(target_bu_id)` — all used by the reverse RLS read lookup.

### 2.7 `mos.signal_acknowledgements` — "I have seen this" (NEW · D33)
`id` · `org_id` · `signal_id` · `person_id` (default current_person_id) · `created_at`.
`unique(signal_id, person_id)`. Never ownership/status.

### 2.8 `mos.signal_revisions` — immutable correction audit (NEW · D31)
`id` · `org_id` · `signal_id` · `actor_id` · `field` `check in ('body','occurred_at','category','attention')` ·
`old_value` text · `new_value` text · `created_at`. Append-only (no update/delete grant).

### 2.9 `mos.signal_tasks` — Signal↔Task many-to-many link (NEW · D25/OD-39)
`id` · `org_id` · `signal_id` (→ signals) · `task_id` (→ `mos.tasks`) · `created_by` (default
current_person_id) · `created_at`. `unique(signal_id, task_id)`. A Signal never gains Status; it shows
*derived* linked-work counts only.

### 2.10 `mos.comments` delta (REUSE · D33)
Alter the `entity_type` CHECK to add `'signal'` (currently `task|weekly_update|daily_log|follow_up`). Signal
comments reuse the existing append-only comment grammar and the `record-feed` component (Rule 11). No new
comment table.

---

## 3. RLS policy matrix (fail-closed — Signals are NOT org-readable)

Unlike `mos.tasks` (org-readable — "cross-unit visibility is the product"), a **Signal's default reach is
narrow and upward** (OD-36/50): sibling Teams do not see each other. RLS **denies** unless a positive grant
matches. Read is factored into a `SECURITY INVOKER STABLE` predicate `mos.can_read_signal(p_signal_id)`
(mirroring `mos.can_edit_task`), reused by the SELECT policy and by child-table reads.

`mos.can_read_signal(sig)` returns true iff `sig.org_id = current_org_id()` **AND** any of:

| # | Grant | Predicate (conservative) |
|---|---|---|
| R1 | **Owning-Team member** | current person has an *active* `team_memberships` row for `sig.owning_team_id` |
| R2 | **BU-scoped Role over parent BU** | current person holds any `role` whose `business_unit_id` = the owning Team's `business_unit_id` (RATIFY-3: schema cannot yet distinguish BU-wide vs Team-scoped roles → matches on BU; narrow later) |
| R3 | **Higher BU visibility layer** | `max(signal_visibility_rank)` over the BUs of the viewer's held roles **>** owning-BU rank (RATIFY-2/4; default all ranks 0 ⇒ grants nothing until admin config) |
| R4 | **Explicit mention** | an *unrevoked* `signal_mentions` row targets: this person; OR a Team this person is an active member of; OR a BU one of the viewer's roles belongs to |
| R5 | **Authorized override** | current person `can('signal.read_all')` (RATIFY-8; capability unregistered/ungranted by default ⇒ off) |

No match ⇒ **deny** (default-deny). Retracted Signals are **not** hidden by RLS (author + grantees keep
audit read) — they are excluded from *default feeds/archive/analytics* at the **query layer**
(`where retracted_at is null`) and rendered as a tombstone (D31).

### Operation × role matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `mos.signals` | `mos.can_read_signal(id)` | author-self + org pinned; `owning_team_id` ∈ author's active membership Teams **unless** `can('signal.create_for_team')` (helper `mos.can_post_signal_for_team`); requires `can('signal.create')` | author-only (or `signal.retract` for retraction); column-pin + revision-append trigger `mos._signal_guard_update`; only `body`/`occurred_at`/`category`/`attention`/`retracted_at`/`retract_reason` mutable | **none** (no policy) |
| `mos.signal_mentions` | reader of the parent Signal | author of the parent Signal; `mention_kind='bu'` requires `can('signal.mention_bu')`; org+kind CHECK | author-only, to set `revoked_at` (mention removal, D31) | none |
| `mos.signal_acknowledgements` | reader of the parent Signal | self-pinned + reader of the parent Signal | none (ack is immutable) | none |
| `mos.signal_revisions` | reader of the parent Signal | trigger-written only (no direct INSERT grant to `authenticated`) | none | none |
| `mos.signal_tasks` | reader of the parent Signal | reader of the parent Signal **and** org member (task INSERT already any-member); `created_by` self-pinned | none | none |
| `mos.comments` (`entity_type='signal'`) | reader of the parent Signal (tighten from same-org — RATIFY-note) | self-pinned + reader of the parent Signal | none | none |

**Notification fan-out** is *not* a direct cross-owner INSERT. A `SECURITY DEFINER` RPC
`mos.fan_out_signal_mention(p_signal_id)` (RATIFY-6): asserts the caller is the Signal's author, resolves
recipient people (deduplicated: `@Person` = 1; `@Team` = active members; `@BU` = active members of child
Teams + BU-scoped-Role holders), enforces the **fan-out cap** (reject/confirm above N), and delivers via
the existing `mos.create_notification` path (org-walled). Future members gain read but **no retroactive
notify** — recipients are snapshotted at post (D24). `@BU` path additionally re-checks `signal.mention_bu`.

**Capabilities to register** in `shared.capabilities` (RATIFY-5): `signal.create` (default-grant to the
member access-role), `signal.create_for_team`, `signal.mention_bu`, `signal.retract` (default-deny; granted
to manager/finance/admin bundles per `e7-data.js`). `signal.correct` is author-implicit (no capability).
`signal.read_all` optional (RATIFY-8; default not registered ⇒ R5 off).

**Cross-org isolation** holds structurally: `org_id` defaulted + WITH-CHECK-pinned on every write;
`can_read_signal` gates on `org_id = current_org_id()` first; `fan_out` and `create_notification` assert a
same-org active target. A cross-org `person_id` claim matches no in-org membership/role rows (fails closed).

---

## 4. Composer UX contract (PORT convergence `sigComposer`/`sigCard` — Rule 11)

**Capture-minimal (Rule 8 / OD-42 / D28).** The composer opens with **exactly four** capture fields; every
enrichment is post-capture and never blocks the post:

| Field | Behaviour |
|---|---|
| **Content** | single `<textarea>`, placeholder *"What happened? Type @ to mention a person, team, or BU."* |
| **Owning Team** | defaults to author's **primary** Team; selectable only among the author's active membership Teams — **unless** `signal.create_for_team`, which unlocks other authorized Teams (OD-49) |
| **Occurrence time** | pill; defaults to *now*; editable (correctable later) |
| **Author** | implicit, shown read-only (*"Author: <name> (implicit)"*); immutable |

**Post action:** `Share Signal` (verb+object, Rule 7). Helper under the button: *"Category is added after
posting — it never blocks capture."*

**Enrichment pills (post-capture on the composer or the posted card):**
- **Site location pill** — derived from the owning Team's Site; **read-only, never a mention target**
  (D37 — Site is location, not audience). Absent for central/site-less Teams.
- **Attention pill** — default **FYI**; tap-to-raise → *Needs attention* → *Urgent* (D29); visual weight
  only, never Status/visibility.
- **Category** — added **on the POSTED card** via *"Add category"* → the 8-family picker; default
  Uncategorised; correctable (D28).

**Mention grammar (`@`)** — a fuzzy **grouped** popover offering **Person / Team / BU** each with a **type
badge** (OD-59). Selecting inserts an `@Name` **mention chip** in the body and stages a `signal_mentions`
grant row. `@BU` is **disabled/blocked in the picker without `signal.mention_bu`** and re-rejected at write
(fail-closed). There is **no `@Site`** (D37/OD-51).

**Visibility + fan-out preview (before post — D24):** a shield line reads *"Visible to <owning Team>"* and,
when mentions are staged, *"· notify N"* with N = the **deduplicated** recipient count. Cross-Team post
shows the destination preview *"Post to <Team> · <attention> · notify N"* (OD-49).

**On the POSTED card (FB grammar):** author avatar + name + occurred-at + attention pill; body with rendered
mention chips; Site + time meta pills; the visibility/shield line; **"Add category"** (until set); and
**"Create Task"** — the follow-up bridge lives on the card, **not** in the composer (D25/OD-39). Retracted
cards render only the tombstone + reason.

**Entry points (reuse — Rule 11):** the composer opens from (a) the ⌘K palette **Share Signal** command
(`command-menu` `a-signal`, currently `navigate('/')` — rewire to open the composer, not a route), (b) the
mobile `+` FAB / desktop `+ Create` Action Launcher (D32/OD-46), and (c) the Home feed's *"Share a Signal"*
row. All dispatch the **same** command. Mention picker extends existing pickers; the record comment thread
reuses `record-feed`.

---

## 5. Feed + archive + record surfaces

### 5.1 Home ambient feed (Q1 — OD-59, **provisional**, RATIFY-7)
Below the non-removable attention brief (which stays a placeholder until Step 5), Home renders the **ambient
Signal feed**: the *"Share a Signal"* composer entry, then Signal cards the viewer `can_read_signal`, newest
first with **attention weighting** (Urgent → Needs attention float above FYI within recency — D29).
Retracted → tombstone. Empty → *"No Signals yet. Share the first one above."* Every card drills to the
Signal's canonical record. **No** top-level "Updates" destination (OD-59).

### 5.2 Work → Signals — archive / search (`/work/signals`, Rule 4)
Replaces today's `SliceStubPage` at `/work/signals`. Job: *"Search and revisit the Signals your Teams have
shared."* A search field filters by text / author / Team over the viewer's readable Signals; rows link to
the canonical record URL (`data-canonical`), show author · Team · Site · occurred-at + attention pill.
Retracted rows show a dimmed tombstone. Canonical route; Back/refresh/new-tab preserve the query (Rule 4).

### 5.3 Signal record page (Rule 6 anatomy · reuse the record-panel host)
In-list click → shared **drawer**; direct URL / new-tab / refresh → full **canonical page** (same renderer,
`mode="panel"|"page"` — OD-63/Rule 4). Content: body · author · owning Team + derived BU/Site · occurred-at ·
attention · category (+ "Add category") · rendered mentions · visibility/shield line · **Edited** indicator
with revision history (D31) · retraction tombstone when retracted · **Acknowledge** control + acknowledger
list (D33) · **comments** thread (reused `record-feed`) · **Linked work** (derived `signal_tasks` counts,
e.g. *"2 Tasks · 1 open"*) with **Create follow-up Task** (opens the canonical Task composer on the same
panel stack, prefilled with Signal context, writes a `signal_tasks` link on save — D25) and **Link existing
Task**. The Signal never shows Status/PIC/Supervisor/resolution.

---

## 6. Requirements

### Functional (EARS)
- **FR-401** The system SHALL persist a Signal with author (implicit, immutable), one owning Team,
  occurrence time, and body as the only required inputs (OD-42/D28).
- **FR-402** WHEN a Signal is posted, the system SHALL default `attention` to `FYI` and `category` to
  Uncategorised, and SHALL NOT require either before accepting the post.
- **FR-403** The system SHALL derive BU and Site from the owning Team and SHALL NOT store them on the
  Signal row (OD-50; CONTEXT team-execution-scope).
- **FR-404** WHERE the author lacks `signal.create_for_team`, the system SHALL restrict `owning_team_id`
  to a Team of the author's active membership (OD-49); otherwise it SHALL allow any authorized Team.
- **FR-405** The system SHALL grant Signal **read** only to: owning-Team members, BU-scoped-Role holders
  over the parent BU, viewers in a strictly-higher configured BU visibility layer, explicitly mentioned
  people/Teams/BUs, or an authorized override — and SHALL **deny** all others (OD-36/50, fail-closed).
- **FR-406** WHEN a mention is added, the system SHALL create a row-level read **grant** AND, via the
  fan-out RPC, deliver deduplicated Inbox notifications; visibility WITHOUT a mention SHALL NOT notify
  (OD-38/D24).
- **FR-407** WHERE a `@BU` mention is added, the system SHALL require `signal.mention_bu` and SHALL block
  it otherwise (OD-51/D24).
- **FR-408** The composer SHALL preview the deduplicated fan-out recipient count BEFORE post (D24).
- **FR-409** Site SHALL be a derived location pill and SHALL NOT be selectable as a mention target (D37).
- **FR-410** WHEN the author corrects `body`/`occurred_at`/`category`/`attention`, the system SHALL append
  an immutable revision, set `edited_at`, and keep `owning_team_id`/`author_id`/`source` immutable (D31).
- **FR-411** WHEN a Signal is retracted, the system SHALL require a reason, exclude it from default
  feeds/archive/analytics, retain an audit tombstone, and SHALL NOT hard-delete it (D31).
- **FR-412** The system SHALL let any reader **Acknowledge** a Signal at most once, as a visible "seen"
  that is not ownership/status/approval (D33).
- **FR-413** The system SHALL support **Create follow-up Task** and **Link existing Task** as a
  many-to-many relation; a Signal SHALL show derived linked-work counts but SHALL NOT gain Status,
  PIC, Supervisor, due date, or resolution (OD-39/D25).
- **FR-414** The Home feed SHALL show Signals the viewer may read, newest-first with attention weighting,
  below the attention region, and SHALL drill each card to its canonical record (OD-59).
- **FR-415** `/work/signals` SHALL be a canonical archive/search route whose search/state lives in URL
  query params and survives Back/refresh/new-tab (Rule 4).
- **FR-416** In-list Signal click SHALL open the drawer; direct/new-tab/refresh SHALL open the same content
  as a full canonical page (OD-63/Rule 4).
- **FR-417** The **Share Signal** command (⌘K / FAB / feed entry) SHALL open the composer, not navigate to
  a route; every entry point SHALL dispatch the same command (D32/OD-46).
- **FR-418** The system SHALL retire the Weekly Update and Daily Log **entry points** while **preserving**
  their stored data and tables (OD-33; §7).
- **FR-419** v1 SHALL reject non-human Signal sources (`source` = `'human'` only) and SHALL NOT auto-mirror
  routine domain events into the feed (OD-44/D30).

### Non-functional
- **NFR-401** RLS **enabled + forced** on every new business table; `org_id` defaulted and WITH-CHECK
  pinned on every write; no `DELETE` grant anywhere.
- **NFR-402** Read authorization SHALL be **default-deny**; a viewer with no positive grant reads zero
  Signal rows (the anti-over-share invariant).
- **NFR-403** Cross-owner notification delivery SHALL flow only through the `SECURITY DEFINER` fan-out /
  `create_notification` seam (no direct cross-owner INSERT), org-walled to same-org active targets.
- **NFR-404** Migrations reversible (manual DOWN); pre-prod reset via `supabase db reset`; staging reset +
  deploy remain owner-gated (OD-34).
- **NFR-405** Composer initial paint SHALL show exactly the four capture fields at ≤390px (Rule 8); tap
  targets ≥44px; the feed's first viewport SHALL show a Signal or the empty-state, never configuration.
- **NFR-406** Coverage ≥80% changed lines; typecheck/lint zero; the review battery + `pre-merge-check.sh`
  green before merge.
- **NFR-407** No component re-implementation (Rule 11): composer/feed/card PORT the convergence grammar;
  comments reuse `record-feed`; the record page reuses the record-panel host; pickers extend existing ones.

---

## 7. Retirement plan (entry points removed · data preserved)

**Removed (entry points only):**
- Rewire `command-menu` `a-signal` **Share Signal** from `navigate('/')` to open the composer command.
- Replace the `/work/signals` `SliceStubPage` with the real archive (§5.2).
- Verify **no** Weekly-Update / Daily-Log nav items, command entries, or Home "Write update" / "Open the
  Daily Log" links remain (the Home dead links were fixed in step 2/3 per OD-64 — assert they stay gone).

**Preserved (NO drop in Step 4 — fail-closed):**
- `mos.weekly_updates` (+ `_events`/types), `ops.log_entries`, and the `weekly_update`/`daily_log`
  `entity_type` values in `mos.comments` remain intact with their data (OD-33 "historical artifacts remain
  evidence").
- The **component/table deletion** (`mos-app/src/components/weekly/*`, `ops-log` code, dead migrations) is
  the **Step-11 decommission sweep**, executed only after Signals (4) + Home (5) fully succeed it — never
  here (buildout plan §Step-11 note).

---

## 8. RATIFY-BEFORE-MERGE (grill + owner walkthrough must ratify each)

1. **Team substrate.** Introduce minimal `shared.teams` + `shared.sites` + `shared.team_memberships`
   (seed migration mirroring `e7-data.js`). *Alt A:* anchor Signal to `business_units` for v1 — **rejected**
   (re-bakes the BU=Team conflation OD-50 fixed; painful re-point later). *Alt B:* full admin-configurable
   Teams/Sites/layers now — **rejected** (that is OD-52's Admin step; balloons Step 4). **Recommend: the
   minimal seeded substrate.**
2. **Visibility-rank placement + default.** Put `signal_visibility_rank` on the **BU** (per OD-36/50
   "higher **BU** layer"), NULL⇒0, **default no cross-BU reach** until an admin sets ranks. *Alt:* rank on
   the Team (as `e7-data.js` did) — **rejected** as a mockup simplification vs domain law. **Recommend:
   BU-rank, fail-closed default.**
3. **BU-scoped-Role read breadth (R2).** The current `roles` schema cannot distinguish BU-wide from
   Team-scoped roles, so R2 grants read to **any** role in the owning BU. *Alt:* add a `team_scope` column
   to narrow to BU-wide-only. **Recommend: match on `business_unit_id` for v1; add narrowing column when
   Admin/org-structure lands** (accept a slightly-broader read within one BU — still never crosses BUs).
4. **Higher-layer viewer definition (R3).** Viewer's effective rank = `max(signal_visibility_rank)` over
   the BUs of the viewer's held roles; grant if `> owning-BU rank`. *Alt:* rank tied to a person's primary
   BU only. **Recommend: max-over-role-BUs (union — matches dual-hat), default-0 ⇒ inert until configured.**
5. **Capability registration + default grants.** Register `signal.create` (default member), and
   `signal.create_for_team` / `signal.mention_bu` / `signal.retract` (**default-deny**, granted to
   manager/finance/admin per `e7-data.js`). **Recommend: register + default-deny the broad three.**
6. **Fan-out mechanism + cap.** Synchronous `SECURITY DEFINER` RPC at post time, dedup, **cap N** (above N
   ⇒ require an explicit confirm), no retroactive notify to future members. *Alt:* async queue — deferred.
   **Recommend: sync RPC + confirm-above-cap; pick N at the walkthrough (proposed 50).**
7. **Q1 — Signal feed on Home (OD-59, provisional).** Spec'd as the ambient region below the attention
   brief. **Owner ratifies at the Step-4 walkthrough** (a "no" removes only §5.1 + Rule-1's Signal-home
   clause; the archive at `/work/signals` stands).
8. **`signal.read_all` override (R5).** An admin escape hatch to read all Signals org-wide. **Recommend:
   do NOT register it in v1 (R5 inert)** — add only if an operational need appears; keeps the surface
   minimal and the default-deny invariant clean.
9. **Correction mechanism.** Corrections via a BEFORE-UPDATE trigger `mos._signal_guard_update` that
   appends `signal_revisions`, sets `edited_at`, pins immutable columns, and gates retraction to author or
   `signal.retract`. *Alt:* a `correct_signal` RPC (as follow-ups use `transition_follow_up`). **Recommend:
   trigger (keeps corrections enforced even on direct PostgREST PATCH).**
10. **Retraction visibility.** RLS keeps retracted rows readable to prior grantees (audit); the **query
    layer** excludes them from default feed/archive/analytics + renders a tombstone. **Recommend: as
    stated** (fail-closed = never hard-delete, never silently vanish from a grantee who already saw it).

*Note (confidential content, OD-37/D23):* v1 ships **no** Restricted Signal mode and **no** pre-save
sensitivity classifier — sensitive matters are simply out of Signal's remit and routed to the approved
private channel by product guidance. A pre-save *warning* is explicitly deferred (not a privacy boundary).

---

## 9. Acceptance criteria (each owned by ONE test at the lowest sufficient layer)

**Schema / RLS — pgTAP (`supabase test db`):**
- **AC-401** (pgTAP): Given a migrated DB, when schema tests run, then `mos.signals`,
  `mos.signal_mentions`, `mos.signal_acknowledgements`, `mos.signal_revisions`, `mos.signal_tasks`, and
  `shared.teams`/`shared.sites`/`shared.team_memberships` exist with RLS enabled **and** forced and the
  documented CHECK/unique constraints hold.
- **AC-402** (pgTAP): Given a member of the owning Team, when they SELECT `mos.signals`, then the Signal is
  visible (R1).
- **AC-403** (pgTAP): Given a member of a **sibling** Team in the same BU with no mention, when they SELECT
  the Signal, then **zero rows** are visible (default-deny; NFR-402).
- **AC-404** (pgTAP): Given a holder of a Role in the owning Team's **parent BU**, when they SELECT, then
  the Signal is visible (R2).
- **AC-405** (pgTAP): Given a viewer whose role BU has `signal_visibility_rank` **greater** than the
  owning-BU rank, when they SELECT, then the Signal is visible; and given equal-or-lower rank with no
  other grant, then zero rows (R3).
- **AC-406** (pgTAP): Given a person explicitly `@`-mentioned (person/Team/BU) via an unrevoked mention,
  when they SELECT, then the Signal is visible; and when the mention is revoked and no other grant applies,
  then zero rows (R4 / D31).
- **AC-407** (pgTAP): Given a viewer in **org-B**, when they SELECT an org-A Signal, then zero rows
  (cross-org isolation).
- **AC-408** (pgTAP): Given an author without `signal.create_for_team`, when they INSERT a Signal whose
  `owning_team_id` is a Team they are **not** a member of, then it is denied; and given a membership Team,
  then it succeeds (FR-404).
- **AC-409** (pgTAP): Given an author without `signal.mention_bu`, when they INSERT a `mention_kind='bu'`
  row, then it is denied; with the capability, then it succeeds (FR-407).
- **AC-410** (pgTAP): Given any authenticated non-service caller, when they attempt DELETE on `mos.signals`
  (or any Signal child table), then it is denied (no delete policy; NFR-401).
- **AC-411** (pgTAP): Given the author, when they UPDATE `body`/`occurred_at`/`category`/`attention`, then a
  `signal_revisions` row is appended, `edited_at` is set, and `owning_team_id`/`author_id` are unchanged;
  and when they attempt to change `owning_team_id` or `author_id`, then it is rejected (FR-410).
- **AC-412** (pgTAP): Given a non-author without `signal.retract`, when they set `retracted_at`, then it is
  denied; given the author (or a `signal.retract` holder) with a reason, then it succeeds and the row
  persists as a tombstone (FR-411).
- **AC-413** (pgTAP): Given a reader, when they INSERT an acknowledgement twice for the same Signal, then
  the second is rejected by the unique constraint; and the row is self-pinned to the caller (FR-412).
- **AC-414** (pgTAP): Given the author calling `mos.fan_out_signal_mention` after a `@Team` + overlapping
  `@Person` mention, then each recipient gets **exactly one** notification (dedup) and no notification
  crosses org (FR-406 / NFR-403).
- **AC-415** (pgTAP): Given a reader of a Signal, when they INSERT a `signal_tasks` link to a same-org
  Task, then it succeeds and `created_by` is self-pinned; the Signal exposes no Status column (FR-413).
- **AC-416** (pgTAP): Given a `mos.comments` row with `entity_type='signal'`, when a **non-reader** of that
  Signal SELECTs comments, then zero rows (comment read is gated to the Signal's readers — RATIFY-note).

**Composer / feed / record — unit (Vitest/RTL, mocked):**
- **AC-420** (unit): Given the composer opens at ≤390px, when it first paints, then exactly the four
  capture fields (content · owning Team · occurrence time · author) are present and no category/attention/
  mention input is required to enable **Share Signal** (Rule 8 / FR-401/402).
- **AC-421** (unit): Given the composer, when the author types `@`, then a grouped picker offers Person /
  Team / BU with type badges, and `@BU` is disabled without `signal.mention_bu` (FR-407 / OD-59).
- **AC-422** (unit): Given staged mentions, when the composer renders the visibility line, then it shows
  *"Visible to <Team>"* and the **deduplicated** *"· notify N"* count before post (FR-408).
- **AC-423** (unit): Given the owning Team has a Site, when the composer renders, then a read-only Site
  location pill appears and Site is absent from the mention picker (FR-409 / D37).
- **AC-424** (unit): Given a posted Signal card without a category, when it renders, then an **"Add
  category"** affordance is present and opens the 8-family picker; **"Create Task"** is on the card, not
  the composer (FR-413 / D25).
- **AC-425** (unit): Given a retracted Signal, when a card/row renders, then only the tombstone + reason
  show and no body/actions (FR-411).
- **AC-426** (unit): Given the Home region, when readable Signals exist, then cards render newest-first with
  Urgent/Needs-attention weighted above FYI; when none, then the *"No Signals yet"* empty-state (FR-414).
- **AC-427** (unit): Given `/work/signals`, when a search term is entered, then the URL query updates and
  the filtered rows link to each Signal's canonical record URL (FR-415/416).
- **AC-428** (unit): Given the ⌘K **Share Signal** command, when invoked, then the composer opens (it does
  **not** navigate to a route) (FR-417).

**End-to-end — Playwright (curated journey F1, may not regress):**
- **AC-430** (e2e · **F1 post-a-Signal**): Given a floor member on Home at 390px, when they open the
  composer, type an observation, `@`-mention a teammate, and press **Share Signal**, then the Signal
  appears at the top of the feed, the mentioned teammate receives an Inbox notification, and opening the
  card lets them **Add category** and **Create follow-up Task** — the real cross-stack flow across
  PostgREST + RLS + the fan-out RPC (one of the three validated journeys).

---

## 10. Open follow-ups (tracked, not Step 4)
- Admin CRUD for Teams / Sites / visibility ranks / capability grants (OD-52) → Admin step.
- Deputy dictation + category/attention suggestion (D28/D29); auto-emission rules + Share-as-Signal
  (D30) → deferred capabilities.
- Generated period views / weekly summaries (D34); Urgent PWA/doorbell delivery (D29) → deferred.
- Followers/Follow-Unfollow on Signals (D33) → deferred until notification volume justifies.
- Narrowing R2 with a role `team_scope` column; async fan-out queue if volume grows (RATIFY-3/6 sequels).
