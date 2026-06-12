# Spec — Ops Log (daily ops feed) (P2-3)

- Feature: the `ops.log_entries` entity end-to-end — schema + RLS (**org-readable**, **any-member
  manual-add**, **edit-own/manager**, **soft-archive**, **no hard delete**) + data layer + the **Ops
  Log feed page** (`/ops` — chronological by `occurred_at` desc, business-unit source badge, typed
  `event_type` chip, needs-attention amber tint, optional linked-task reference, filters by unit +
  type, archived hidden/toggle, phone-friendly) + a **manual "+ Add log entry" form** (business_unit
  defaulting to the creator's primary-unit, event_type, title, detail, occurred_at default-now-editable,
  needs_attention toggle, optional linked task) + the **My Week ops-strip wiring** (count of today's
  entries + needs-me amber flag per OD-P0-8 — the strip currently shows a static "0 events"
  placeholder).
- Status: Draft for owner sign-off.
- Authority: business rules are **pre-decided** in `docs/decisions.md` **OD-P2-15..19** (LOCKED
  2026-06-12) plus OD-P0-8 (My Week ops strip = count + needs-me flag), OD-P1-3 (ops org-readable read
  posture), OD-P1-1 (server-stamped unspoofable `org_id`), OD-P1-4 (Mon–Sun WIB day/week boundaries),
  OD-P0-2 (EN chrome / ID content), OD-P0-3 (desktop-first, phone-usable submit), OD-P1-7 (union manager
  chain via `is_manager_of`), OD-DIR-7 (first-slice scope; kitchen/roastery mirror is **P2-4 DEFERRED**).
  This spec **encodes**, it does not re-open them. Each rule cites its OD id inline.
- UI authority (SIGNED): `docs/design-mockups/mock-daily-ops-feed.html` — the **generic typed-event
  stream** is the chosen framing (single ~1080px density-mode column; source badge only + muted type
  text; needs-attention warning tint + 2px left rule + linked-task line; phone ~390px frame with a
  co-located 44px "+ Add" submit). The kitchen-specific-tabs alternate in the mockup history is
  **dropped** (its 4 mockup "OPEN QUESTIONS" are all resolved by OD-P2-15..19 — see §9).
- Vocabulary: `CONTEXT.md` — **Log entry · Ops Log · Needs attention · Business Unit · Task** — used
  **exactly**. The word **"event" is AVOIDED** (it collides with Gordi's cafe events — cuppings,
  workshops, bookings); the row is a **Log entry**, the surface is the **Ops Log** (OD-P2-15).
- Mirrors the P2-1 `mos.tasks` conventions: schema shape (`org_id` default `shared.current_org_id()`,
  `set_updated_at` trigger), the enable+FORCE RLS posture, the `current_org_id()`/`current_person_id()`/
  `is_manager_of()`/`is_org_member()` helpers, the `can_edit_task` edit-gate function pattern, the
  `_guard_archive` trigger pattern, the **no-DELETE-grant** posture, and the **client-side name
  resolution** discipline (PostgREST cannot FK-embed `ops`→`mos`/`shared`; the P2-1b "no cross-schema
  embed" lesson). PostgREST exposure of the `ops` schema follows ADR-0004's `mos`-exposure pattern.

## Out of scope (explicit non-goals)

- **Kitchen / roastery MIRROR** — the `kitchen_app` / `roastery_app` ingest is **P2-4, DEFERRED**
  (OD-DIR-7, OD-P2-17). In P2-3 every log entry has `origin = 'manual'`; the `origin` CHECK already
  admits `kitchen_app` / `roastery_app` so a future mirror writes the same row shape with **no schema
  change**. No external-writer service, no ingest endpoint, no service-role write path in this slice.
- **A Task is not created here** — `linked_task_id` is an **optional reference to an existing**
  `mos.tasks` row (the follow-up seam, OD-P2-18). The Ops Log neither creates nor edits tasks; it has
  **no owner / RACI / status** of its own (a Log entry is a past-tense floor record, OD-P2-16).
- **Cross-schema embed / server-side task-name join** — the linked-task **title** is resolved
  **client-side** from the existing `mos.tasks` / `directory.ts` layer; the feed query never FK-embeds
  `ops.log_entries`→`mos.tasks` (PGRST200 under the `ops` profile; the P2-1b lesson, OD-P2-18).
- **Reactions / comments / acknowledgement on a log entry** — a log entry is a flat record; no comment
  thread, no "ack" in v1 (parallels weekly-update review staying read-only, P2-2).
- **Notifications / reminders** — needs-attention drives only the **My Week amber flag** (a pull
  signal); no email/push/SMTP send (consistent with P2-2's deferred reminders).
- **Per-source domain models / typed payloads** (batch weights, QC fields, lot numbers as columns) —
  the mockup's `#R-882` / `25.0 kg` machine IDs live inside the free-text `detail`, not as typed
  columns. The schema is the **generic typed-event stream** (OD-P2-17/18); a richer per-source model is
  not in scope.
- **Hard delete** — there is **no** hard-delete path; removal is **soft-archive** only (`archived_at`,
  reversible), enforced by withholding the DELETE grant (OD-P2-19, mirrors P2-1 NFR-002).

---

## 1. Overview & user value

The **Ops Log** is Gordi's chronological record of what *happened on the floor* — a high-frequency
stream of past-tense, factual **Log entries** (production · receiving · QC · follow-up · other), each
**business-unit-badged** and timestamped at when it `occurred_at` (OD-P2-15/16, CONTEXT.md). It is the
counterpart to Tasks: Tasks are the few deliberate forward commitments (owner, RACI, status); a Log
entry is a done thing with **no owner / RACI / status**, just *when it occurred* (OD-P2-16). The two
touch **only** at the follow-up seam — a log entry may carry **Needs attention** and link to a Task
("follow-up about that blocked task", OD-P2-18).

In P2-3 every entry is added **manually** by an org member (the kitchen/roastery mirror is P2-4,
DEFERRED — OD-DIR-7); `origin = 'manual'` always. The **source** of an entry is its **Business Unit**
(the badge — Kitchen and Bar / Roastery / …), while a separate `origin` marker records *who wrote it*
so future mirrors slot in without a schema change (OD-P2-17).

The Ops Log is **org-readable** — every org member reads every non-archived entry (floor visibility is
the product, OD-P1-3) — a deliberate contrast with weekly updates' upward-only posture. **Any org
member may add** an entry (`org_id` + `created_by` stamped server-side); **edit and archive** are gated
to the **author or a manager of the author** (reuse `is_manager_of`, the `can_edit_task` pattern);
removal is **soft-archive** only, **no hard delete** (OD-P2-19).

Primary jobs:
- **Scan** the Ops Log feed (`/ops`) — newest-first by `occurred_at`, source badge + type chip, the
  amber needs-attention rows standing out, optional linked-task reference — filterable by **unit** and
  **type**, with **archived** hidden by default (toggle to reveal); usable on a **phone**.
- **Add** a log entry — manually, fast: business unit (defaulting to my primary unit), type, title,
  optional detail, occurred_at (defaulting to now, **editable** — "log a 9am happening at noon"), a
  **Needs attention** toggle, and an optional link to a Task.
- **Glance** at my My Week **ops strip** — today's entry count + an **amber needs-me flag** when a
  needs-attention entry waits on me — and jump to `/ops`.

---

## 2. Domain model & vocabulary (CONTEXT.md — used exactly)

| Term | Meaning in this spec |
|---|---|
| **Log entry** | An `ops.log_entries` row. A past-tense factual record that something *happened* on the floor — typed, business-unit-badged, timestamped at `occurred_at`. **No owner / RACI / status** (OD-P2-16). The word **"event" is avoided** (OD-P2-15). |
| **Ops Log** | The chronological surface — the `/ops` feed — listing log entries newest-first by `occurred_at` (OD-P2-15, CONTEXT.md). |
| **Business Unit** (source) | The `business_unit_id` FK → `shared.business_units` — the **source badge** (Kitchen and Bar / Roastery / Cafe Ops – General / Sales – CRM / Finance and People, OD-P1-5). Carries the badge (OD-P2-17). |
| **origin** | A marker of *who wrote* the entry: `manual` \| `kitchen_app` \| `roastery_app` (default `manual`). **P2-3 = always `manual`**; future mirrors set it with no schema change (OD-P2-17). Distinct from the Business Unit source. |
| **event_type** (type) | The typed category: `production` \| `receiving` \| `qc` \| `follow_up` \| `other` (default `other`, extensible by widening the CHECK, OD-P2-18). Rendered as the muted type text/chip beside the source badge. |
| **Needs attention** | The amber state on a log entry (`needs_attention` boolean, author-set, default false) meaning something waits on the viewer — sign-off, follow-up. Drives the feed's warning tint **and** the My Week ops-strip amber (OD-P2-18, OD-P0-8, CONTEXT.md). |
| **linked_task_id** | An **optional** nullable FK → `mos.tasks` — the follow-up seam ("follow-up about that blocked task"). The task **title** is resolved **client-side** (no cross-schema embed). The Ops Log never creates/edits the task (OD-P2-18). |
| **occurred_at** | `timestamptz`, default `now()`, **editable** — when the thing actually happened (may differ from when it was logged: "log a 9am happening at noon"). The feed's sort key (desc) and "today" basis (WIB) (OD-P2-18). |
| **Archived** (a log entry) | Soft-removed via an `archived_at` timestamp — hidden from the default feed, revealable by toggle, reversible. **No hard delete** (OD-P2-19, CONTEXT.md "Archived"). |
| **Manager** | A person holding a role strictly above (any of) the author's roles via the union chain (`shared.is_manager_of`, OD-P1-7) — the author-or-manager edit/archive gate. |
| **Today** (My Week strip) | The set of entries whose `occurred_at` falls in the current **WIB calendar day** (OD-P1-4, OD-P0-8). |

---

## 3. Data model

### 3.1 `ops.log_entries` (OD-P2-15..19)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `org_id` | uuid NOT NULL, FK `shared.orgs(id)` ON DELETE CASCADE, default `shared.current_org_id()` | Org seam; server-stamped, client-unspoofable (OD-P1-1). |
| `business_unit_id` | uuid NOT NULL, FK `shared.business_units(id)` | The **source** badge (OD-P2-17). Required (every entry has a source unit). |
| `origin` | text NOT NULL default `'manual'`, `CHECK (origin IN ('manual','kitchen_app','roastery_app'))` | *Who wrote it*. **P2-3 always `manual`**; mirror sets future values, no schema change (OD-P2-17). |
| `event_type` | text NOT NULL default `'other'`, `CHECK (event_type IN ('production','receiving','qc','follow_up','other'))` | The typed category, text+CHECK (cheap to widen later, mirrors OD-P2-1) (OD-P2-18). |
| `title` | text NOT NULL, `CHECK (btrim(title) <> '')` | The one-line "what happened" (the feed's `.ev-text`). Non-blank. |
| `detail` | text | Optional free-text body — machine IDs (`#R-882`), quantities, approver notes live here as content, **not** typed columns (OD-P2-18, generic-stream). |
| `occurred_at` | timestamptz NOT NULL default `now()` | When it happened — **editable** (OD-P2-18). Feed sort key (desc) + WIB-today basis. |
| `needs_attention` | boolean NOT NULL default `false` | Author-set amber flag (OD-P2-18). Drives feed tint + My Week strip. |
| `linked_task_id` | uuid NULL, FK `mos.tasks(id)` ON DELETE SET NULL | Optional follow-up reference (OD-P2-18). Name resolved client-side. `ON DELETE SET NULL` so a (soft-archived, never hard-deleted) task can't orphan; defensive. |
| `archived_at` | timestamptz NULL | Soft-archive (reversible). Hidden from default feed (OD-P2-19). |
| `created_by` | uuid NOT NULL, FK `shared.people(id)` default `shared.current_person_id()` | The author; server-stamped (OD-P2-19). Basis of the edit/archive gate. |
| `created_at` / `updated_at` | timestamptz NOT NULL default `now()` | `updated_at` via `shared.set_updated_at()` trigger (P1 pattern). |

Constraints / indexes:
- Index `(org_id, occurred_at desc)` — the feed's primary "newest-first within org" query.
- Partial index `(org_id, occurred_at desc) WHERE archived_at IS NULL` — the default (non-archived) feed (mirrors `tasks_active_org_idx`).
- Index `(business_unit_id)` — the unit filter.
- Index `(event_type)` — the type filter.
- Index `(org_id, needs_attention) WHERE needs_attention AND archived_at IS NULL` — the My Week needs-me scan.
- Index `(linked_task_id) WHERE linked_task_id IS NOT NULL` — reverse lookup (entries referencing a task).

> A log entry has **no** `responsible_person_id` / `accountable_person_id` / `status` (OD-P2-16) — it
> is not work-to-do. `created_by` is provenance, **not** ownership; it does not appear as an "owner" in
> the feed.

### 3.2 "Today" + sort derivation (OD-P1-4, OD-P0-8)
The feed sorts by `occurred_at` **desc** (server-side `.order('occurred_at', { ascending: false })`).
The My Week ops strip's **"today"** is the current **WIB calendar day** — `[WIB-midnight today,
WIB-midnight tomorrow)` expressed as UTC instants, computed by a **pure exported helper** in
`mos-app/src/lib/week.ts` reusing the existing `WIB_OFFSET_MS` fixed-offset arithmetic (no host-tz
leak, NFR-004) — e.g. `wibDayRange(now): { startISO, endISO }`. The strip counts entries with
`occurred_at ∈ [startISO, endISO)` and flags amber when any such entry (or any non-archived
needs-attention entry — see FR-061) has `needs_attention = true`.

### 3.3 RLS gate functions (OD-P2-19) — mirror `can_edit_task`
A SQL `STABLE` `SECURITY INVOKER` helper `ops.can_edit_log_entry(p_entry_id uuid)` returns the
**author-or-manager-of-author** predicate, org-scoped — the exact shape of `mos.can_edit_task`, reused
by the UPDATE policy:
```
created_by = current_person_id()  OR  is_manager_of(created_by)   -- AND org_id = current_org_id()
```
Because this helper is `SECURITY INVOKER` (like `can_edit_task`), **no `SECURITY DEFINER`** is
introduced, so the integration-CI "every SECURITY DEFINER migration must revoke PUBLIC execute" lint is
satisfied trivially (no DEFINER to revoke). The **archive** column (`archived_at`) is allowed to change
by the **same** gate as edit (author-or-manager — OD-P2-19 does *not* narrow archive to a stricter set
than edit, unlike P2-1's A-only archive); a `BEFORE UPDATE` `_guard_*` trigger is therefore **not
required** for a narrower archive rule, but the no-hard-delete guarantee is structural (no DELETE
grant, §3.4).

### 3.4 No hard delete (OD-P2-19) — privilege-enforced
No DELETE is granted to `authenticated` on `ops.log_entries` (mirrors `mos.tasks` NFR-002). Removal is
**soft-archive** — an UPDATE setting `archived_at` (reversible by clearing it), gated by
`can_edit_log_entry`. `service_role` bypasses RLS but is not used by the app tier in P2-3.

---

## 4. Functional requirements (EARS)

### Schema & invariants
- **FR-001** The system shall persist a log entry as an `ops.log_entries` row with the columns of §3.1,
  `origin` defaulting to `manual` and `event_type` to `other`, both constrained by CHECK to their
  allowed sets (OD-P2-17/18).
- **FR-002** The system shall require a non-blank `title` and a non-null `business_unit_id` on every log
  entry (`CHECK (btrim(title) <> '')`, NOT NULL FK) (OD-P2-17, mock `.ev-text`/source badge).
- **FR-003** The system shall stamp `org_id` from `shared.current_org_id()` and `created_by` from
  `shared.current_person_id()` **server-side** on insert, rejecting any client-supplied value differing
  from the session (OD-P1-1, OD-P2-19).
- **FR-004** The system shall default `occurred_at` to `now()` while permitting the author to set it to
  any instant (past or future) — `occurred_at` is **editable** (OD-P2-18).
- **FR-005** The system shall store `needs_attention` as a boolean defaulting to `false`, author-set
  (OD-P2-18).
- **FR-006** The system shall accept an **optional** `linked_task_id` referencing an existing
  `mos.tasks` row, and shall **null it** (not cascade-delete the entry) if the referenced task row is
  ever removed (`ON DELETE SET NULL`) (OD-P2-18). *(A log entry never creates or edits the task.)*
- **FR-007** The system shall mark the `event_type` and `origin` allowed sets as **text + CHECK** (not
  PG enums) so the vocabularies are cheap to widen later (e.g. add a mirror origin) without a type
  migration (OD-P2-17/18, mirrors OD-P2-1).

### Read — org-readable posture (OD-P1-3)
- **FR-010** The system shall make every **non-archived** log entry readable by **any member of the
  same org** (org-readable floor visibility — contrast weekly-updates' upward-only) (OD-P1-3, OD-P2-19).
- **FR-011** Where a log entry belongs to a **different org** than the session, the system shall make it
  unreadable (org isolation precedes everything) (OD-P1-1, OD-P2-19).
- **FR-012** The system shall make **archived** log entries readable to org members **only when
  explicitly requested** (the archived toggle); the default feed read excludes `archived_at IS NOT
  NULL` (OD-P2-19, mock default feed). *(Archived rows remain org-readable when the toggle is on — they
  are hidden by a query predicate, not by RLS.)*

### Write — any-member add; edit/archive author-or-manager (OD-P2-19)
- **FR-020** The system shall permit **any org member** to INSERT a log entry, with `org_id` and
  `created_by` server-stamped and unspoofable (OD-P2-19, OD-P1-1).
- **FR-021** The system shall gate **editing** a log entry (title, detail, type, business unit,
  occurred_at, needs_attention, linked_task_id) to the **author** (`created_by =
  current_person_id()`) **or a manager of the author** (`is_manager_of(created_by)`), org-scoped —
  reusing the `is_manager_of` union chain (OD-P2-19, OD-P1-7, mirrors `can_edit_task`).
- **FR-022** The system shall gate **archiving / unarchiving** (`archived_at` NULL↔ts) to the **same
  author-or-manager** gate as editing (OD-P2-19 — archive is **not** narrowed below the edit gate,
  unlike P2-1's A-only archive). Archive is reversible.
- **FR-023** The system shall **not** permit hard deletion of a log entry by the app tier — removal is
  soft-archive only, enforced by withholding the DELETE grant (OD-P2-19, §3.4).
- **FR-024** When a non-author / non-manager attempts to edit or archive a log entry, the system shall
  deny it (RLS); the feed UI shall expose edit/archive affordances only on entries the viewer may edit
  (OD-P2-19).
- **FR-025** The system shall treat `created_by` and `org_id` as **immutable** once written: any UPDATE
  that changes either is denied at the DB layer (`ops._guard_log_entry` BEFORE UPDATE → `42501`). The
  edit gate re-reads the row by id, so WITH CHECK alone cannot block authorship re-attribution / forced
  handoff / cross-org `created_by` — the trigger is the authority (security audit HIGH, 2026-06-12).
- **FR-026** The system shall require, on INSERT and UPDATE, that every reference resolves **within the
  entry's org**: the referenced `shared.business_units.org_id` and (when non-null) `mos.tasks.org_id`
  must equal the entry's `org_id`, else denied (`ops._guard_log_entry` → `23514`). The FKs check
  existence only (bypass RLS), so this closes the cross-org reference / existence-oracle seam
  (security audit MEDIUM, 2026-06-12).

### Ops Log feed page (`/ops`) — mock-daily-ops-feed (SIGNED)
- **FR-030** The system shall render the Ops Log as a **single ~1080px column** chronological feed
  ordered by `occurred_at` **descending** (newest first), in the adopted density mode (OD-P0-7,
  mock-daily-ops-feed).
- **FR-031** The system shall render each entry row with: the `occurred_at` **time** (WIB, tabular), a
  **source badge** = the entry's Business Unit name, the **event_type** as muted type text/chip (the
  mock's `.etype` — source badge is the *only* badge, no double badge), and the `title` as the row text
  (OD-P2-17/18, mock-daily-ops-feed delta #2).
- **FR-032** Where a log entry has `detail`, the system shall render it as the row's meta/secondary
  line; machine IDs within it render in the **mono** identifier face (mock `.mono`, the
  Mono-For-Identifiers rule) (mock-daily-ops-feed).
- **FR-033** Where a log entry has `needs_attention = true`, the system shall render the row with the
  **amber warning tint** + 2px warning left rule (the mock's `.event.attn`) — the visible "something
  waits on the floor" signal (OD-P2-18, mock-daily-ops-feed delta #4).
- **FR-034** Where a log entry has a `linked_task_id`, the system shall render a **linked-task
  reference** line showing the **task's title** (resolved **client-side** from `mos.tasks` /
  `directory.ts` — **no** cross-schema embed) and, when available, the task's status (e.g. "· Blocked")
  (OD-P2-18, mock `.linked`, the P2-1b no-embed lesson).
- **FR-035** The system shall provide a **source (Business Unit) filter** — "All sources" plus a chip
  per unit — filtering the feed to the selected unit (OD-P0-3, mock `.filters`).
- **FR-036** The system shall provide a **type filter** (event_type) — All / production / receiving /
  qc / follow_up / other — filtering the feed to the selected type (OD-P2-18, mock `.filters` "Type").
- **FR-037** The system shall **hide archived** entries from the feed by default and provide an
  **archived toggle** that, when on, includes archived entries (visibly distinguished) (OD-P2-19,
  FR-012).
- **FR-038** The system shall **reflow the feed for phone** (~390px): block rows with the time inline,
  source badge + type, the needs-attention tint preserved, and a co-located **44px "+ Add log entry"**
  touch target (OD-P0-3, mock phone frame).
- **FR-039** The system shall render an **empty** feed state ("No ops entries yet today — …" with the
  source-filter hint), a **loading** state (skeleton rows), and an inline **error** state ("Couldn't
  load the Ops Log — Retry") with the filters staying usable (mock-daily-ops-feed STATES COVERED).

### Manual "+ Add log entry" form (OD-P2-17/18, mock submit affordance)
- **FR-040** The system shall provide a manual **"+ Add log entry"** form reachable from the Ops Log
  page (and the phone submit bar), creating an `ops.log_entries` row with `origin = 'manual'` (OD-P2-17,
  mock `.btn-primary`).
- **FR-041** The system shall default the form's **Business Unit** to the **creator's primary unit** —
  the business unit of the creator's **earliest-assigned role** (the AS-2 / OD-P2-2 primary-role rule
  reused from task-create), editable to any unit; dual-hats get the deterministic earliest-role default
  (OD-P2-17, parallels OD-P2-2).
- **FR-042** The system shall require **Title** and **Business Unit** to submit the form, and shall keep
  **detail**, **linked task**, and the **needs-attention** toggle optional (FR-002).
- **FR-043** The system shall default the form's **event_type** to `other` and offer the five typed
  values (production / receiving / qc / follow_up / other) (OD-P2-18).
- **FR-044** The system shall default the form's **occurred_at** to **now** and allow the author to edit
  it to another instant before submitting ("log a 9am happening at noon") (OD-P2-18, FR-004).
- **FR-045** The system shall offer an optional **linked Task** picker resolving against existing
  `mos.tasks` (by title); selecting one sets `linked_task_id`. Leaving it empty stores NULL (OD-P2-18).
- **FR-046** When the form is submitted, the system shall insert the entry (org_id + created_by
  server-stamped) and the new entry shall **appear in the feed** in `occurred_at` order without a full
  reload (FR-020/030).
- **FR-047** The system shall **disable submit** while Title is blank or no Business Unit is chosen, and
  surface an inline validation cue (FR-002/042).

### My Week ops-strip wiring (OD-P0-8) — replaces the static placeholder
- **FR-060** The system shall wire the My Week **ops strip** to the count of **today's** log entries —
  entries whose `occurred_at` is in the current **WIB calendar day** — replacing the static "0 events"
  placeholder (OD-P0-8; current `MyWeek.tsx` ops strip §3.2).
- **FR-061** The system shall set the ops strip **amber (needs-me flag)** when **any** non-archived
  needs-attention entry waits on the viewer; per OD-P0-8 the strip carries a count + a needs-me flag
  (no preview text). *(The "waits on the viewer" set is the non-archived `needs_attention = true`
  entries — there is no per-person assignee on a log entry, so any open needs-attention entry the viewer
  can see drives the amber; FR-034's linked-Blocked-task entry is the canonical case.)*
- **FR-062** The system shall keep the ops strip's **link into `/ops`** (the existing "Today on Ops →")
  and render its **loading** and **error** states gracefully (count hidden / inline retry), degrading
  independently of the sibling weekly-update strip (OD-P0-8, mock home strips, P2-2 strip pattern).

---

## 5. Non-functional requirements

- **NFR-001 (Security — org-read RLS).** `ops.log_entries` shall have RLS **enabled and FORCED**, with
  SELECT scoped to `org_id = current_org_id()` (org-readable — every member reads all non-archived
  entries; **not** upward-only) and cross-org reads returning zero rows. Proven in **pgTAP** (OD-P1-3,
  OD-P2-19).
- **NFR-002 (Security — any-member insert, unspoofable stamps).** INSERT shall be allowed to any org
  member with `org_id` and `created_by` server-stamped (DB defaults `current_org_id()` /
  `current_person_id()`) and a WITH CHECK rejecting a client-supplied `org_id` ≠ session org. Proven in
  **pgTAP** (OD-P2-19, OD-P1-1).
- **NFR-003 (Security — edit/archive author-or-manager).** UPDATE (including the `archived_at` column)
  shall be gated by `ops.can_edit_log_entry` = `created_by = current_person_id() OR
  is_manager_of(created_by)`, org-scoped; a peer/non-manager UPDATE returns zero affected / is denied.
  Proven in **pgTAP** (OD-P2-19, OD-P1-7).
- **NFR-004 (Security — no hard delete).** No DELETE grant to `authenticated`; hard delete is
  structurally impossible for the app tier. Removal is soft-archive (`archived_at`). Proven in **pgTAP**
  (a DELETE attempt is denied) (OD-P2-19, §3.4).
- **NFR-005 (Time correctness — WIB).** The feed time display and the My Week strip's "today"
  (WIB-calendar-day range) shall be computed in Asia/Jakarta (WIB, UTC+7, no DST) reusing
  `mos-app/src/lib/week.ts` fixed-offset arithmetic — no host-timezone leakage (OD-P1-4, OD-P0-8).
- **NFR-006 (No cross-schema embed).** The feed/data layer shall **never** request a PostgREST FK embed
  from `ops.log_entries` into `mos.tasks` or `shared.*` (PGRST200 under the `ops` profile); the source
  Business Unit name and linked-task title are resolved **client-side** from the directory / tasks
  layer (the P2-1b lesson, OD-P2-18, ADR-0004).
- **NFR-007 (Reversibility & convention).** The migration shall be reversible (drop table/function/
  trigger cleanly) and follow the existing conventions — schema-qualified, `set search_path = ''` on
  functions, enable+FORCE RLS, **no DELETE grant**, **SECURITY INVOKER** gate function (so the
  SECURITY-DEFINER-revoke CI lint has nothing to flag) (P1/P2-1 patterns, ADR-0004, integration.yml lint).
- **NFR-008 (Design fidelity).** The feed (single ~1080px column, 44–48px rows, source-badge-only +
  muted type text, needs-attention warning tint + left rule, linked-task line, unit/type filter chips,
  phone reflow with 44px add target) and the add form shall match `mock-daily-ops-feed.html`
  composition/density using **only DESIGN.md tokens** (OD-DIR-8, OD-P0-7, OD-P0-3). Source-badge hues
  reuse the existing categorical mapping (Kitchen=primary@10%, Roastery=violet@12%); **no new hues**.
- **NFR-009 (Vocabulary fidelity).** UI copy, columns, and identifiers shall use CONTEXT.md terms
  exactly: **Log entry**, **Ops Log**, **Needs attention**, **Business Unit** (source), **Task** (the
  linked reference). The word **"event" shall not appear** in user-facing chrome (OD-P2-15) — the page
  title/strip say "ops" / "log entry", never "event". *(The mockup's legacy `.event` CSS class and
  "events" copy are pre-rename mock fixtures; the built UI uses "log entr(y/ies)".)*
- **NFR-010 (i18n posture).** English chrome/labels; user content (`title`, `detail`) in Indonesian
  rendered as-is — no i18n framework (OD-P0-2).
- **NFR-011 (Coverage / gates).** Changed code shall meet the binding gates: ≥80% lines, `npm run
  typecheck` clean, ESLint `--max-warnings=0`; each `AC-###` proven at its lowest sufficient layer.

---

## 6. Acceptance criteria (Given/When/Then) — each tagged with its owning test layer

> **Test-pyramid rule (CLAUDE.md):** each `AC-###` is owned by **one** test at the **lowest sufficient
> layer**. The **RLS org-read + cross-org block + any-member insert + edit/archive author-or-manager
> gate + no-hard-delete + org_id-spoof + CHECK constraints** → **pgTAP** (the security core). The
> **feed states/filters/badges/needs-attention/linked-task render, add-form validation + defaults, My
> Week ops-strip states, WIB-today calc** → **Unit (Vitest/RTL)**. Real cross-stack journeys → **E2E
> (Playwright)**, curated, **2 only**. The AC id is tagged in the owning test's title so `grep -r
> AC-###` finds the proof.

### RLS — org-readable read + cross-org block → **pgTAP**
- **AC-001 [pgTAP]** Given a non-archived log entry in org A authored by person P, When **any** other
  member of org A selects it, Then the row is returned (org-readable floor visibility) — FR-010.
- **AC-002 [pgTAP]** Given a log entry in org A, When a member of **org B** selects it, Then **zero
  rows** are returned (cross-org isolation) — FR-011, NFR-001.
- **AC-003 [pgTAP]** Given an **archived** log entry (archived_at non-null) in org A, When an org-A
  member selects with the default feed predicate (`archived_at IS NULL`), Then it is excluded; When the
  same member selects without that predicate (toggle on), Then it is returned (archived rows stay
  org-readable, hidden by query not RLS) — FR-012, FR-037.

### RLS — any-member insert + unspoofable stamps → **pgTAP**
- **AC-010 [pgTAP]** Given an authenticated org member M (not a manager, any role), When M inserts a log
  entry with a valid business unit and title, Then it succeeds and `org_id` + `created_by` are stamped
  to M's session org / person — FR-020, FR-003, NFR-002.
- **AC-011 [pgTAP]** Given member M, When M attempts to insert a log entry with `org_id` set to a
  **foreign org**, Then the insert is rejected by WITH CHECK (`org_id = current_org_id()`) — FR-003,
  NFR-002.
- **AC-012 [pgTAP]** Given member M, When M attempts to insert with `created_by` set to **another
  person**, Then the stamp is overridden to / constrained to `current_person_id()` (a forged author is
  not persisted) — FR-003, NFR-002.

### RLS — edit/archive author-or-manager gate → **pgTAP**
- **AC-020 [pgTAP]** Given a log entry authored by P, When **P** updates its title/detail/type/
  needs_attention, Then it succeeds (author edits own) — FR-021.
- **AC-021 [pgTAP]** Given P's log entry, When **P's manager** (ancestor role via the union chain)
  updates it, Then it succeeds (manager-of-author edits) — FR-021, OD-P1-7.
- **AC-022 [pgTAP]** Given P's log entry, When a **peer** of P (org member, not P's manager) updates it,
  Then it is denied (zero rows affected) — FR-024, NFR-003.
- **AC-023 [pgTAP]** Given P's log entry, When **P** sets `archived_at` (archive) and later clears it
  (unarchive), Then both succeed (reversible, author-gated); When a **peer** sets `archived_at`, Then it
  is denied — FR-022, NFR-003.
- **AC-024 [pgTAP]** Given a **dual-hat** author P reporting (via different held roles) to managers M1
  and M2, When either M1 or M2 edits P's entry, Then it succeeds for **both** (union chain) — FR-021,
  OD-P1-7.

### RLS — created_by/org_id immutable on UPDATE (security HIGH) → **pgTAP**
- **AC-025 [pgTAP]** Given an author's own log entry, When the author issues an UPDATE that changes
  `created_by` to another person (incl. a foreign-org person), Then it is denied (`42501`), and a normal
  title/needs_attention edit on the same row still persists — FR-025 (authorship re-attribution / forced
  handoff blocked).
- **AC-026 [pgTAP]** Given an author's own log entry, When the author issues an UPDATE that changes
  `org_id` to a foreign org, Then it is denied (`42501`) — FR-025 (cross-org relocation blocked).

### Refs same-org on INSERT/UPDATE (security MEDIUM) → **pgTAP**
- **AC-013 [pgTAP]** Given a member of org A, When they INSERT a log entry whose `business_unit_id`
  belongs to **org B**, Then it is denied (`23514`); a same-org `business_unit_id` is allowed — FR-026
  (cross-org reference / existence-oracle closed).
- **AC-014 [pgTAP]** Given a member of org A, When they INSERT or UPDATE a log entry whose
  `linked_task_id` belongs to **org B**, Then it is denied (`23514`); a same-org or **NULL**
  `linked_task_id` is allowed — FR-026.

### RLS — no hard delete + org-scope on update → **pgTAP**
- **AC-030 [pgTAP]** Given any log entry, When an authenticated member (author, manager, or service-less
  app tier) issues a **DELETE**, Then it is denied (no DELETE grant) — FR-023, NFR-004.
- **AC-031 [pgTAP]** Given P's log entry in org A, When P's manager attempts an UPDATE that would set
  `org_id` to a **foreign org**, Then WITH CHECK rejects it (an editor cannot move a row cross-org) —
  FR-021, NFR-002/003.

### Schema CHECK constraints → **pgTAP**
- **AC-040 [pgTAP]** Given an insert with `event_type` outside {production, receiving, qc, follow_up,
  other}, or `origin` outside {manual, kitchen_app, roastery_app}, or a **blank** `title`, or a NULL
  `business_unit_id`, Then the CHECK / NOT-NULL constraint rejects it — FR-001, FR-002, FR-007.
- **AC-041 [pgTAP]** Given a log entry with a `linked_task_id`, When the referenced `mos.tasks` row is
  deleted, Then the entry's `linked_task_id` becomes NULL and the entry survives (`ON DELETE SET NULL`)
  — FR-006.

### WIB "today" + sort helper → **Unit (Vitest/RTL)**
- **AC-050 [unit]** Given `wibDayRange(now)` fed a fixed clock at WIB day boundaries (00:00 WIB, 23:59
  WIB, and the UTC instants straddling WIB midnight), Then it returns the correct `[startISO, endISO)`
  half-open UTC range for the WIB calendar day with no host-tz leak — FR-060, NFR-005.

### Feed — render, badges, needs-attention, linked-task, states → **Unit (Vitest/RTL)**
- **AC-060 [unit]** Given a list of log entries, When the feed renders, Then rows appear **newest-first
  by occurred_at**, each with the WIB time, the **source badge** = its Business Unit name, the
  **event_type** as muted type text (no second badge), and the title — FR-030, FR-031.
- **AC-061 [unit]** Given an entry with `detail` containing a machine ID, When its row renders, Then the
  detail shows as the meta line with the ID in the **mono** face — FR-032.
- **AC-062 [unit]** Given an entry with `needs_attention = true`, When its row renders, Then it carries
  the **amber warning tint + left rule**; a `needs_attention = false` entry does not — FR-033.
- **AC-063 [unit]** Given an entry with a `linked_task_id` and a client-resolved task title+status,
  When its row renders, Then it shows the **linked-task reference** line with that title (and status);
  Given a `null` link, Then no reference line renders — FR-034 (and: the component receives the title as
  a prop / from the tasks layer — **no** cross-schema embed is requested, NFR-006).
- **AC-064 [unit]** Given the feed with the **source filter** set to a unit, Then only that unit's
  entries show; Given the **type filter** set to a type, Then only that type's entries show; "All"
  clears each — FR-035, FR-036.
- **AC-065 [unit]** Given entries including archived ones, When the **archived toggle** is off, Then
  archived entries are hidden; when on, Then they appear (visibly distinguished) — FR-037, FR-012.
- **AC-066 [unit]** Given the feed in loading → renders skeleton rows; in error → renders inline
  "Couldn't load the Ops Log — Retry" with filters still usable; with zero entries → renders the empty
  state copy — FR-039.
- **AC-067 [unit]** Given a ~390px viewport, When the feed renders, Then rows reflow to the phone block
  layout (time inline, badge + type, needs-attention tint preserved) and a **44px "+ Add log entry"**
  target is present — FR-038, NFR-008.

### Add form — defaults & validation → **Unit (Vitest/RTL)**
- **AC-070 [unit]** Given the add form opened by a creator whose earliest-assigned role is in Business
  Unit U, When it renders, Then **Business Unit defaults to U**, **event_type defaults to `other`**, and
  **occurred_at defaults to now** (editable) — FR-041, FR-043, FR-044.
- **AC-071 [unit]** Given the add form, When **Title is blank or no Business Unit** is chosen, Then
  **Submit is disabled** with an inline validation cue; filling both enables it — FR-042, FR-047.
- **AC-072 [unit]** Given the add form, When the author toggles **Needs attention**, sets **occurred_at**
  to a past instant, and picks an optional **linked Task**, then submits, Then the dispatched insert
  carries `needs_attention = true`, the edited `occurred_at`, `linked_task_id` set, and `origin =
  'manual'` (and the layer never sends `org_id`/`created_by`) — FR-040, FR-044, FR-045, FR-005,
  NFR-002/006.
- **AC-073 [unit]** Given a successful submit, When the form closes, Then the new entry **appears in the
  feed** in occurred_at order without a full reload — FR-046.

### My Week ops strip → **Unit (Vitest/RTL)**
- **AC-080 [unit]** Given the viewer has **N** log entries with `occurred_at` in today's WIB day and
  **none** needs-attention, When My Week renders, Then the ops strip shows the **count N** (neutral
  pill, no amber) and links to `/ops` — FR-060, FR-062.
- **AC-081 [unit]** Given at least one **non-archived needs-attention** entry for the viewer, When My
  Week renders, Then the ops strip is **amber (needs-me flag)** — FR-061.
- **AC-082 [unit]** Given the ops-strip query in loading → strip shows a neutral/loading state; in error
  → inline retry, **independently** of the weekly-update strip (degrades pane-by-pane) — FR-062.

### Curated end-to-end journeys → **E2E (Playwright)** — 2 only
- **AC-090 [e2e]** **Add → appears in the feed.** Given an authenticated org member on `/ops`, When they
  open "+ Add log entry", choose a Business Unit + type, enter a title (and detail), and submit, Then
  the new **Log entry appears at the top of the feed** (occurred_at = now) with the correct source badge
  and type — FR-040/041/043/046/030/031.
- **AC-091 [e2e]** **Needs-attention drives the My Week amber, then archive clears the feed.** Given a
  member adds a log entry with **Needs attention** on, Then the **My Week ops strip goes amber** and the
  entry shows the warning tint on `/ops`; When the author (or their manager) **archives** that entry,
  Then it **leaves the default feed** (reappears only with the archived toggle) and the strip's amber
  clears — FR-061/033/022/037/060.

---

## 7. Error handling

| Condition | Layer | Behaviour |
|---|---|---|
| Cross-org read of a log entry | RLS USING | Zero rows (org-isolated) (AC-002). |
| Client-supplied foreign `org_id` on insert/update | RLS WITH CHECK | Rejected (AC-011, AC-031). |
| Forged `created_by` on insert | DB default + WITH CHECK | Constrained to `current_person_id()`; forged author not persisted (AC-012). |
| Non-author / non-manager edits or archives an entry | RLS USING | Denied (0 affected); feed exposes no edit/archive affordance for non-editors (FR-024, AC-022/023). |
| Hard DELETE attempt by the app tier | Privilege (no grant) | Denied — removal is soft-archive only (AC-030). |
| Invalid `event_type` / `origin` / blank `title` / null `business_unit_id` | DB CHECK / NOT NULL | Rejected (AC-040). |
| Referenced task removed | DB FK `ON DELETE SET NULL` | `linked_task_id` nulled; entry survives (AC-041). |
| Submit add-form with blank Title / no Business Unit | UI | Submit disabled + inline cue (FR-047, AC-071). |
| Feed load fails | UI | Inline "Couldn't load the Ops Log — Retry"; filters stay usable (FR-039, AC-066). |
| Ops-strip query fails | UI | Strip shows inline retry, independent of the weekly-update strip (FR-062, AC-082). |
| Linked task title unresolvable (e.g. task archived/out of view) | UI (client resolve) | Reference line degrades gracefully (show id-less "linked task" or hide) — **no** cross-schema embed retried (NFR-006, FR-034). |

---

## 8. Implementation checklist (build order; TDD red-green per CLAUDE.md)

**Schema / DB (pgTAP red first):**
- [ ] Migration `ops.log_entries` (§3.1): columns, CHECKs (`origin`, `event_type`, non-blank `title`),
      `linked_task_id` FK `ON DELETE SET NULL`, indexes (`(org_id, occurred_at desc)`, the
      partial-non-archived, `business_unit_id`, `event_type`, the needs-attention partial,
      `linked_task_id` partial); `set_updated_at` trigger; reversible (drop in down-equivalent).
- [ ] `ops.can_edit_log_entry(uuid)` — `STABLE` `SECURITY INVOKER` `set search_path=''`, author-or-
      manager-of-author, org-scoped (mirror `mos.can_edit_task`). **No SECURITY DEFINER** (lint clean).
- [ ] Base grants: SELECT / INSERT / UPDATE to `authenticated`; **NO DELETE grant** (NFR-004).
- [ ] RLS enable+FORCE. SELECT USING `org_id = current_org_id()` (org-readable, FR-010). INSERT WITH
      CHECK `org_id = current_org_id() AND is_org_member()` (any member, FR-020). UPDATE USING
      `ops.can_edit_log_entry(id)` WITH CHECK `org_id = current_org_id() AND can_edit_log_entry(id)`
      (edit + archive same gate, FR-021/022). Confirm `ops` schema is PostgREST-exposed (ADR-0004
      pattern) + grants on the schema/usage as `mos` has.
- [ ] pgTAP suite `supabase/tests/23_ops_log_*.sql` onward (numbered after existing `22_…`): org-read +
      cross-org (AC-001/002/003), any-member insert + org/created_by stamp + spoof (AC-010/011/012),
      edit/archive author-or-manager + peer-deny + dual-hat (AC-020..024), no-hard-delete + cross-org-
      update (AC-030/031), CHECKs + FK-set-null (AC-040/041).

**Lib / data layer (`mos-app/src/lib/`):**
- [ ] `week.ts`: add `wibDayRange(now): { startISO, endISO }` (half-open UTC range for today's WIB day),
      pure/clock-mockable (AC-050).
- [ ] `database.types.ts` regenerated for the new `ops.log_entries` table.
- [ ] `lib/db/opsLog.ts` (mirrors `db/tasks.ts`: `supabase.schema('ops')`, **never sends
      `org_id`/`created_by`**, throws on PostgREST error, **no cross-schema embed**): `listLogEntries({
      businessUnitId?, eventType?, includeArchived? })` (occurred_at desc), `addLogEntry(input)`,
      `editLogEntry`, `archiveLogEntry`/`unarchive`, `getTodayOpsSummary()` (count + needs-attention
      flag for the strip via `wibDayRange`). Linked-task title resolved client-side via `db/tasks.ts` /
      `directory.ts` (NFR-006). Reuse `directory.getBusinessUnits` for source-name + filter chips.
- [ ] Creator primary-unit resolution for the add-form default — reuse the earliest-assigned-role rule
      already used by task-create (viewer roles ordered by `created_at` asc; map role→business_unit).

**UI (`mos-app/src/pages/OpsPage.tsx` + components — to signed mockup, DESIGN.md tokens):**
- [ ] Replace `OpsPage` placeholder with the single ~1080px feed: filter chips (source + type),
      archived toggle, `occurred_at`-desc rows (source badge + muted type + title + detail meta +
      needs-attention tint + linked-task line), empty/loading/error states, phone reflow + 44px add
      target (FR-030..039, AC-060..067). Reuse the categorical source-badge hues; consider an
      `OpsSourceBadge` + reuse `StatusPill` token for the linked-task status.
- [ ] "+ Add log entry" form (modal/inline): Business Unit (primary-unit default), event_type (`other`
      default), title (required), detail, occurred_at (now default, editable), needs-attention toggle,
      optional linked-Task picker; submit-disabled validation; on success refresh the feed
      (FR-040..047, AC-070..073).
- [ ] My Week ops-strip wiring: replace the static "0 events" placeholder in `MyWeek.tsx` (§3.2 strip)
      with live today-count + needs-me amber + loading/error, keeping the "Today on Ops →" link
      (FR-060..062, AC-080..082).

**E2E (`mos-app/e2e/` — 2 curated):**
- [ ] AC-090 add→appears-in-feed. AC-091 needs-attention→My-Week-amber, then archive→leaves-feed.

---

## 9. Owner-decision flags
**None.** All business rules are pre-decided in **OD-P2-15..19** (+ OD-P0-8 ops strip, OD-P1-3 org-read,
OD-P1-1 unspoofable org/person stamps, OD-P1-4 WIB boundaries, OD-P1-7 union manager chain, OD-P0-2/3
language + responsive, OD-DIR-7 first-slice / kitchen mirror deferred) and encoded above with inline
citations. No open `[OWNER-DECISION]` remains for P2-3.

> The four mock-daily-ops-feed "OPEN QUESTIONS" are all resolved by the locked ODs and recorded here,
> not re-opened: (1) the **`ops` schema** is the **generic typed-event stream** (`ops.log_entries`,
> single shape, filter by source + type) — WALL-4's call, settled by OD-P2-15/17 (§3.1, FR-030/031).
> (2) the **needs-attention criterion** = the author sets `needs_attention` explicitly; the canonical
> case is a follow-up linked to a Blocked task — OD-P2-18 (FR-033, FR-061). (3) entries are
> **manually authored in MOS** (org members add directly); mirrors are P2-4 DEFERRED — OD-P2-17,
> OD-DIR-7 (FR-040). (4) the **event-type vocabulary** is the owner-canonical five (production /
> receiving / qc / follow_up / other, extensible CHECK) — OD-P2-18 (FR-007, FR-043).
>
> Implementation-detail notes (not owner decisions): (a) archive uses the **same** author-or-manager
> gate as edit (OD-P2-19 does not narrow it, so no `_guard_archive`-style trigger is needed — contrast
> P2-1's A-only archive). (b) The "waits on the viewer" set for the strip amber (FR-061) is, in the
> absence of a per-person assignee on a log entry, the non-archived `needs_attention = true` entries —
> an `eng-planner` mechanism detail; OD-P0-8 fixes the *signal* (count + needs-me flag), not the row
> predicate.
