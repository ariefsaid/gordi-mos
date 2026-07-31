# Spec — Weekly updates (P2-2)

- Feature: the `mos.weekly_updates` entity end-to-end — schema + RLS (**upward-only read**) + data
  layer + the **write surface** (my weekly update: summary + update lines with progress marker; Save
  draft / Submit / Reopen) + the **manager review surface** (read-only: my team's updates for a week,
  filed/draft/not-started + on-time/late signal) + the **My Week weekly-update strip** wiring (it
  currently links to `/updates` with placeholder copy — now it reflects real draft/submitted state).
- Status: Draft for owner sign-off.
- Authority: business rules are **pre-decided** in `docs/decisions.md` **OD-P2-10..14** (LOCKED
  2026-06-11) plus OD-P0-1 (per-person), OD-P0-9 (person-keyed change from Notion project-keyed),
  OD-P1-3 (upward-only read posture), OD-P1-4 (Mon–Sun WIB week, Fri 17:00 WIB due), OD-P1-7 (union
  manager chain). This spec **encodes**, it does not re-open them. Each rule cites its OD id inline.
- UI authority (SIGNED): `docs/design-mockups/mock-weekly-update.html` (write pane first, manager
  review pane stacked second; single ~1080px density-mode column).
- Vocabulary: `CONTEXT.md` — **Weekly Update · Update line · Progress marker · Submitted/Draft · Week ·
  Person · Manager** — used **exactly**.
- Mirrors the P1 RLS pattern (enable+FORCE, `current_org_id()`/`current_person_id()`/`is_manager_of()`)
  and the P2-1 `mos.tasks` schema/RLS/data-layer conventions (ADR-0004 PostgREST exposure of `mos`).

## Out of scope (explicit non-goals)

- **Reminders / notifications** (email, push, SMTP) — deferred to a later notification issue; the
  Friday due drives an **on-time vs late signal only**, no send (OD-P2-14). No SMTP dependency in P2-2.
- **Acknowledgement / comments on a reviewed update** — manager review is **read-only** in v1; no
  acknowledge, no comment captured (OD-P2-12). (Can come later, like task comments from P2-1.)
- **Task ↔ update linkage** — update lines are free text with **no FK to `mos.tasks`** (OD-P2-10). The
  bridge can be added later as an additive nullable FK if usage demands (cf. ADR-0003's task seam).
- **Unit-level rollups** — updates are strictly per-person; no business-unit aggregate (OD-P0-1).
- **People/role admin UI** — directory is read-only here (P1 posture); review roster derives from the
  existing role chain (`shared.is_manager_of`).
- **Tasks, ops events** — separate Phase-2 issues. This spec wires the My Week *weekly-update strip*
  only; the tasks table and ops strip on that page are unchanged.

---

## 1. Overview & user value

Every Gordi manager and selected ops user files **one Weekly Update per week** — a person-keyed recap
of their week: a free-text **summary** plus a list of **update lines**, each carrying a **progress
marker** (Done / In progress / Blocked) as a "what we've achieved" cue (OD-P2-10, CONTEXT.md). This is
the deliberate person-keyed replacement for Notion's project-keyed "Project Updates" (OD-P0-9).

A weekly update is **Draft** (editable) until the author **Submits** it, which locks it read-only — the
stable artifact a manager reviews. The author may **Reopen** a submitted update back to Draft, fix it,
and re-Submit (OD-P2-11). **Everyone files**, including the top-of-chain person who has no reviewer
(self-cadence / visibility). Late filing is allowed and weeks **never hard-lock**; the Friday 17:00 WIB
due drives only an **on-time vs late signal** (OD-P2-14, OD-P1-4).

A **Manager** reads their team's updates for a selected week — read-only — seeing each person's
**filed / draft / not-started** state and an **on-time vs late** signal (OD-P2-12). Managers are
themselves authors and file their own update upward.

This is the **one entity with a non-org-readable posture**: a weekly update is readable by **its author
and anyone in their manager chain only** (union over all held roles), never by peers or downward, never
cross-org (OD-P1-3 — "weekly updates: upward-only"). This contrasts sharply with `mos.tasks`
(org-readable) and is the security-sensitive heart of this slice.

Primary jobs:
- **Write** my weekly update for the current week (or a prior week): summary + add/edit/reorder/remove
  update lines, set each line's progress marker; **Save draft**, **Submit** (locks), **Reopen** to revise.
- **Review** (manager) my team's updates for a chosen week — read-only — at-a-glance "who still owes me
  an update" via filed/draft/not-started + on-time/late.
- **Glance** at my My Week strip and see my real weekly-update state (no update / draft / submitted +
  on-time vs late) instead of the static placeholder.

---

## 2. Domain model & vocabulary (CONTEXT.md — used exactly)

| Term | Meaning in this spec |
|---|---|
| **Weekly Update** | A `mos.weekly_updates` row. Person-keyed recap of one person's week: org_id, person_id, week_start, summary, status, submitted_at, timestamps. Keyed by (person, week). Everyone files one. |
| **Update line** | A `mos.weekly_update_items` row inside a weekly update — free text + a progress marker + order. NOT FK'd to a Task (OD-P2-10). Distinct from a Task and a Checklist item. |
| **Progress marker** | The done/achieved cue on an update line — **Done · In progress · Blocked** (`done`/`in_progress`/`blocked`). Distinct from a task's **Status** (self-reported, not the task's real state). |
| **Submitted / Draft** | A weekly update is **Draft** (editable) until the author **Submits** it (locks read-only). The author may **Reopen** → Draft → edit → re-Submit (OD-P2-11). `status` ∈ {draft, submitted}. |
| **Week** | Monday–Sunday in Asia/Jakarta; `week_start` = that week's **Monday in WIB** (OD-P1-4, OD-P2-13). The update for a week is due **Fri 17:00 WIB**. |
| **Person** | A `shared.people` row — the author of an update; the reviewed subject in a manager's roster (CONTEXT.md "Person"). |
| **Manager** | A person holding a role strictly above (any of) the target's roles via the union chain (`shared.is_manager_of`, OD-P1-7). Reviews their people's updates; is itself an author. |
| **On-time / Late** | Signal only (no lock): a submitted update is **on-time** if `submitted_at` ≤ Fri 17:00 WIB of its `week_start` week, else **late** (OD-P2-14, OD-P1-4). |
| **Filed / Draft / Not started** | Manager-review per-person states: **Filed** = an update exists with status submitted; **Draft** = exists with status draft; **Not started** = no update row for that (person, week). |

---

## 3. Data model

### 3.1 `mos.weekly_updates` (OD-P2-10/11/13)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `org_id` | uuid NOT NULL, FK `shared.orgs(id)` ON DELETE CASCADE, default `shared.current_org_id()` | Org seam; server-stamped, client-unspoofable (OD-P1-1). |
| `person_id` | uuid NOT NULL, FK `shared.people(id)` | The author (the person the update is *about* and *by* — OD-P0-1). |
| `week_start` | date NOT NULL | The week's **Monday in WIB** (OD-P1-4, OD-P2-13). DATE, no time-of-day. |
| `summary` | text NOT NULL default `''` | Free-text "this week's summary" (OD-P2-10). May be empty in draft. |
| `status` | text NOT NULL default `'draft'`, `CHECK (status IN ('draft','submitted'))` | Lifecycle as text+CHECK, not a PG enum (mirrors OD-P2-1 rationale). |
| `submitted_at` | timestamptz | Set when status → submitted; cleared (NULL) on Reopen. Drives on-time/late (OD-P2-14). |
| `created_at` / `updated_at` | timestamptz NOT NULL default `now()` | `updated_at` via `shared.set_updated_at()` trigger (P1 pattern). |

Constraints / indexes:
- **`UNIQUE (org_id, person_id, week_start)`** — exactly one weekly update per person per week (OD-P2-13).
- Index `(org_id, week_start)` — the manager-review "team, for a week" query.
- Index `(person_id, week_start)` — the author's "my update for week W" lookup + the My Week strip.
- `CHECK` coupling status↔submitted_at (§3.4 invariant): `status = 'submitted'` iff `submitted_at IS NOT NULL`.

### 3.2 `mos.weekly_update_items` (OD-P2-10) — the update lines
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `org_id` | uuid NOT NULL, FK `shared.orgs(id)` ON DELETE CASCADE, default `shared.current_org_id()` | Org seam (RLS scoping). |
| `weekly_update_id` | uuid NOT NULL, FK `mos.weekly_updates(id)` **ON DELETE CASCADE** | Parent update; lines die with the update. |
| `label` | text NOT NULL, `CHECK (btrim(label) <> '')` | The free-text update line (OD-P2-10). |
| `progress` | text NOT NULL default `'in_progress'`, `CHECK (progress IN ('done','in_progress','blocked'))` | The **progress marker** (OD-P2-10). NOT a task Status. |
| `position` | integer NOT NULL | Order within the update (reorder support). |
| `created_at` / `updated_at` | timestamptz NOT NULL default `now()` | |

> Lines are **not** foreign-keyed to `mos.tasks` (OD-P2-10) — a weekly recap is narrative +
> self-reported progress, not task-tracking. No `task_id`, no cascade bridge in P2-2.

### 3.3 Week-key derivation (OD-P2-13, OD-P1-4)
`week_start` is the **Monday of the target week in WIB**, derived client-side and sent as a `YYYY-MM-DD`
DATE. This requires a new **pure exported helper** in `mos-app/src/lib/week.ts` — `weekStartISO(now,
offsetWeeks = 0)` returning the Monday `YYYY-MM-DD` for the WIB week containing `now` (offset by N weeks
for prior-week viewing) — built from the existing `WIB_OFFSET_MS` Monday arithmetic (no host-tz leak,
NFR-004). The Friday-17:00-WIB due instant for a given `week_start` is likewise derived from the same
offset arithmetic (`week_start` Monday + 4 days at 17:00 WIB) for the on-time/late comparison.

### 3.4 Lifecycle invariants (status ↔ submitted_at) — DB-enforced
The status/submitted_at pair is kept consistent server-side regardless of write path, so the manager
always reviews a coherent artifact and a torn client write cannot desync them:
- **Save draft:** `status = 'draft'`, `submitted_at = NULL`.
- **Submit:** `status = 'submitted'`, `submitted_at = now()` (set at submit time, OD-P2-11).
- **Reopen:** `status = 'submitted' → 'draft'`, `submitted_at = NULL` (OD-P2-11).
Enforced by (a) the `CHECK` coupling in §3.1, plus (b) a `BEFORE UPDATE`/`BEFORE INSERT` trigger that
stamps/clears `submitted_at` from the incoming `status` transition (so the data layer sets `status`
only and the DB owns `submitted_at`). Late filing is allowed: **no week hard-lock** — Submit/Reopen are
permitted for any `week_start`, past or present (OD-P2-14). On-time vs late is a *derived signal* from
`submitted_at` vs the week's Friday 17:00 WIB, never a gate.

---

## 4. Functional requirements (EARS)

### Schema & invariants
- **FR-001** The system shall persist a weekly update as a `mos.weekly_updates` row with the columns of
  §3.1, `status` defaulting to `draft` and constrained by `CHECK` to {draft, submitted} (OD-P2-11).
- **FR-002** The system shall enforce `UNIQUE (org_id, person_id, week_start)` — at most one weekly
  update per person per week (OD-P2-13).
- **FR-003** The system shall key a weekly update by `week_start` = the **Monday (in WIB) of the target
  week** (OD-P1-4, OD-P2-13), stored as a plain `date`.
- **FR-004** The system shall store each update line as a `mos.weekly_update_items` row carrying only
  `label` (non-blank), `progress` ∈ {done, in_progress, blocked}, `position`, and `weekly_update_id`,
  with **no foreign key to `mos.tasks`** (OD-P2-10).
- **FR-005** The system shall couple `status` and `submitted_at` such that `status = 'submitted'` iff
  `submitted_at IS NOT NULL`, enforced at the DB layer (§3.4) (OD-P2-11/14).
- **FR-006** The system shall stamp `org_id` server-side from `shared.current_org_id()` on both tables
  and reject any client-supplied `org_id` differing from the session org (OD-P1-1).
- **FR-007** When an update line's parent update is deleted, the system shall cascade-delete the line
  (`ON DELETE CASCADE`) (§3.2).

### Write — author-only create/edit (OD-P2-11/14)
- **FR-010** When a person opens their weekly update for a week, the system shall load the existing row
  for (current person, `week_start`) if one exists, else present an empty draft to create (OD-P2-13).
- **FR-011** The system shall permit **creating and editing** a weekly update (summary, lines, status)
  **only to its author** — the person whose `person_id` the row carries (`person_id =
  current_person_id()`); no other person, including a manager, may write it (OD-P2-11/12, OD-P1-3).
- **FR-012** When the author **Saves a draft**, the system shall persist the summary and lines with
  `status = 'draft'` and `submitted_at = NULL`, leaving the update editable (OD-P2-11).
- **FR-013** When the author **Submits**, the system shall set `status = 'submitted'` and
  `submitted_at` to the submit instant, and thereafter present the update **read-only** (locked) to the
  author until reopened (OD-P2-11).
- **FR-014** When the author **Reopens** a submitted update, the system shall set `status = 'draft'`
  and clear `submitted_at`, restoring edit (OD-P2-11).
- **FR-015** While a weekly update has `status = 'submitted'`, the system shall reject summary/line
  edits to it (the lock); edits are permitted only after Reopen (OD-P2-11). *(Enforced both in the UI —
  read-only render — and at the DB: line writes require the parent update to be the caller's own and in
  draft; see §6 RLS ACs.)*
- **FR-016** When the author adds an update line, the system shall persist it with the next `position`
  and a chosen progress marker (default `in_progress`) (OD-P2-10).
- **FR-017** When the author edits an update line's text or progress marker, removes a line, or reorders
  lines, the system shall persist the change while the update is in draft (OD-P2-10/11).
- **FR-018** The system shall allow **late filing**: Save draft / Submit / Reopen are permitted for any
  `week_start` (current or prior); a week is **never hard-locked** by its Friday due (OD-P2-14).
- **FR-019** Where the summary is empty **and** the update has zero lines, the system shall **disable
  the Submit action** (an empty update cannot be submitted), while Save draft stays available
  (mock-weekly-update "Submit disabled until non-empty"). *(Save-as-draft of an empty update is allowed
  — drafts may be empty.)*

### Read — upward-only posture (OD-P1-3, OD-P1-7) — the security core
- **FR-020** The system shall make a weekly update readable by **its author** (`person_id =
  current_person_id()`) (OD-P1-3).
- **FR-021** The system shall make a weekly update readable by **any person in the author's manager
  chain** — `shared.is_manager_of(person_id)` true, walking `reports_to_role_id` upward, **union over
  all roles the author holds** (OD-P1-3, OD-P1-7).
- **FR-022** The system shall make a weekly update **unreadable** to a **peer** (same level, not in the
  author's manager chain) and to anyone **downward** (the author's own reports) — the posture is
  upward-only, not org-readable; this is the one entity that is **not** org-readable (OD-P1-3, contrast
  `mos.tasks`).
- **FR-023** Where a weekly update belongs to a different org than the session, the system shall make it
  unreadable (org isolation, OD-P1-1).
- **FR-024** The system shall apply the **same upward-only read** to `mos.weekly_update_items` as to
  their parent update — a viewer may read the lines iff they may read the parent (OD-P1-3).

### Manager review surface — read-only (OD-P2-12)
- **FR-030** The system shall present a **manager review** surface listing, for a selected `week_start`,
  every person in the manager's team — **the manager's direct reports** (people whose role's
  `reports_to_role_id` is one of the manager's roles). NOTE (amended 2026-06-12, Director): the
  review-pane *roster* is **direct reports** (the "your manager reviews yours" cadence; matches the
  My Week team module, OD-P0-8). The `is_manager_of` union chain (OD-P1-7) is the RLS **read ceiling** —
  a grand-manager / the CEO is still *authorized* to open any update below them — but the roster itself
  lists direct reports. For the flat 2-level Gordi org these coincide; a transitive / CEO-org-wide
  roster view is backlogged for when the org exceeds two levels. (OD-P2-12, OD-P0-8.)
- **FR-031** The system shall render each review row with the person's name + role, an excerpt of their
  update summary (or "No update yet" when none), a submit time, and a **state pill**: **Filed** (update
  exists, submitted), **Draft** (exists, draft), or **Not started** (no row for that person+week)
  (OD-P2-12, mock-weekly-update review pane).
- **FR-032** The system shall show summary counts above the review list — *N filed · M draft · K not
  started* (mock-weekly-update `review-summary`).
- **FR-033** The system shall surface an **on-time vs late** signal for each filed (submitted) update —
  on-time when `submitted_at` ≤ the week's **Friday 17:00 WIB**, otherwise late (OD-P2-14, OD-P1-4).
- **FR-034** The system shall make the manager review surface **strictly read-only** — no edit, no
  acknowledgement, no comment affordance on any reviewed update in v1 (OD-P2-12).
- **FR-035** The system shall default the review week to the **current** WIB week and allow the manager
  to view **prior weeks** (week navigation), recomputing the roster states for the chosen week (OD-P1-4).
- **FR-036** Where a person is a **dual-hat** reporting to several managers (union chain), the system
  shall show that person's single weekly update in **every** such manager's review roster (OD-P1-7).

### My Week weekly-update strip wiring (OD-P2-14, replaces placeholder)
- **FR-040** The system shall wire the My Week "weekly update" strip to the viewer's real update for the
  **current WIB week**, replacing the static placeholder: state pill = **No update** (no row), **Draft**
  (row, draft), or **Submitted** (row, submitted) (OD-P2-14; current `MyWeek.tsx` strip).
- **FR-041** When the strip shows **Submitted**, the system shall additionally indicate **on-time vs
  late** for that submission (per FR-033) (OD-P2-14).
- **FR-042** The system shall keep the strip's **Due Fri \<date\>** affordance (current-week Friday, WIB)
  and its link into the Updates surface, now reflecting live state copy (e.g. "Draft saved" / "Submitted
  on time" / "No weekly update for this week yet") (OD-P1-4, mock-weekly-update; existing `week.ts`
  `fridayShort`).

---

## 5. Non-functional requirements

- **NFR-001 (Security — RLS upward-only, the crux).** Both `mos.weekly_updates` and
  `mos.weekly_update_items` shall have RLS **enabled and FORCED**, with SELECT scoped to **author OR
  `is_manager_of(author)`** (union chain) **AND** `org_id = current_org_id()` — provably **not**
  org-readable (peers/downward denied) — and writes gated to **author-only** (OD-P1-3, OD-P1-7,
  OD-P2-11). The full upward/peer/downward/cross-org matrix shall be proven in **pgTAP**.
- **NFR-002 (Security — author-only write).** No person other than the author (manager included) shall
  be able to INSERT or UPDATE a weekly update or its lines — enforced by RLS WITH CHECK / USING on
  `person_id = current_person_id()` (parent) and parent-author membership (lines) (OD-P2-11/12).
- **NFR-003 (Security — unspoofable org).** A client shall not write a row with an `org_id` other than
  its session org, even given INSERT/UPDATE grants (WITH CHECK `org_id = current_org_id()`) (OD-P1-1).
- **NFR-004 (Time correctness — WIB).** `week_start` (Monday) and the Friday-17:00 due (on-time/late)
  shall be computed in Asia/Jakarta (WIB, UTC+7, no DST), reusing `mos-app/src/lib/week.ts` fixed-offset
  arithmetic — no host-timezone leakage (OD-P1-4, OD-P2-13/14).
- **NFR-005 (Lifecycle integrity).** `status`/`submitted_at` shall not desync: the DB shall guarantee
  `status = 'submitted'` ⇔ `submitted_at IS NOT NULL` across every write path (§3.4) (OD-P2-11/14).
- **NFR-006 (Reversibility).** The migration shall be reversible (drop tables/triggers cleanly) and
  follow existing conventions — schema-qualified, `set search_path = ''` on functions, enable+FORCE RLS,
  no DELETE grant beyond what line-removal needs (line DELETE is author-gated; updates are never
  hard-deleted — they soft-exist as draft) (P1/P2-1 patterns, ADR-0004).
- **NFR-007 (Vocabulary fidelity).** UI copy, columns, and identifiers shall use CONTEXT.md terms
  exactly: **Weekly Update**, **Update line**, **Progress marker** (Done/In progress/Blocked — never
  "Status" for a line), **Submitted/Draft** (never "filed" as the status name — "Filed" is only the
  manager-review pill label), **Reopen**, **on-time/late**.
- **NFR-008 (Design fidelity).** The write pane (summary textarea, update-line rows with progress
  pills, co-located Save draft + Submit + quiet save confirm) and the manager review pane (≥56px rows,
  Filed/Draft/Not-started pills, summary counts, week pill) shall match `mock-weekly-update.html`
  composition/density using only DESIGN.md tokens (OD-DIR-8, OD-P0-7).
- **NFR-009 (i18n posture).** English chrome/labels; user content (summary, line text) in Indonesian
  rendered as-is — no i18n framework (OD-P0-2).
- **NFR-010 (Coverage / gates).** Changed code shall meet the binding gates: ≥80% lines, `npm run
  typecheck` clean, ESLint `--max-warnings=0`; each `AC-###` proven at its lowest sufficient layer.

---

## 6. Acceptance criteria (Given/When/Then) — each tagged with its owning test layer

> **Test-pyramid rule (CLAUDE.md):** each `AC-###` is owned by **one** test at the **lowest sufficient
> layer**. The **RLS upward-only read + author-only write + cross-org block + status-transition gating
> + unique-per-week** contracts → **pgTAP** (the bulk — this is the security-sensitive non-org-readable
> entity). Write-pane states (draft/submit/reopen, line add/edit/marker/reorder/remove, validation),
> review-pane (team list, filed/draft/not-started, on-time/late, empty), My Week strip state, and the
> WIB `weekStartISO`/Friday-due helpers → **Unit (Vitest/RTL)**. Real cross-stack journeys → **E2E
> (Playwright)**, curated, 2 only. The AC id is tagged in the owning test's title so `grep -r AC-###`
> finds the proof.

### RLS — upward-only read posture → **pgTAP** (the security core)
- **AC-001 [pgTAP]** Given a weekly update authored by person P, When **P** selects it, Then the row is
  returned (author reads own) — FR-020.
- **AC-002 [pgTAP]** Given P's weekly update, When **P's manager** (an ancestor role holder via the
  union chain) selects it, Then the row is returned — FR-021, OD-P1-7.
- **AC-003 [pgTAP]** Given P's weekly update, When a **grand-manager** (two levels up the chain) selects
  it, Then the row is returned (chain is transitive) — FR-021.
- **AC-004 [pgTAP]** Given P's weekly update, When a **peer** of P (same/sibling level, not in P's
  manager chain) selects it, Then **zero rows** are returned (no peer read) — FR-022.
- **AC-005 [pgTAP]** Given a manager M's own weekly update, When **M's report** P selects it, Then
  **zero rows** are returned (no downward read) — FR-022.
- **AC-006 [pgTAP]** Given P is a **dual-hat** reporting (via different held roles) to managers M1 and
  M2, When either M1 or M2 selects P's single weekly update, Then it is returned to **both** (union
  chain) — FR-021, FR-036, OD-P1-7.
- **AC-007 [pgTAP]** Given P's weekly update in org A, When a member of **org B** (even one who would be
  a manager by role shape) selects it, Then zero rows are returned (cross-org isolation precedes the
  chain) — FR-023, NFR-001.
- **AC-008 [pgTAP]** Given P's weekly update with update lines, When a permitted reader (author or
  manager) selects the **lines**, Then they are returned; When a peer or downward viewer selects the
  lines, Then zero rows are returned (lines inherit the parent's upward-only posture) — FR-024.

### RLS — author-only write & status transitions → **pgTAP**
- **AC-010 [pgTAP]** Given an authenticated person P, When P inserts a weekly update with `person_id =
  P` for a `week_start`, Then it succeeds and `org_id` is stamped to P's session org — FR-006, FR-011.
- **AC-011 [pgTAP]** Given P, When P attempts to insert a weekly update with `person_id` set to **another
  person**, Then the insert is rejected (author-only WITH CHECK `person_id = current_person_id()`) —
  FR-011, NFR-002.
- **AC-012 [pgTAP]** Given P's weekly update, When **P's manager** attempts to UPDATE its summary/status,
  Then it is denied (managers read but never write — review is read-only) — FR-011, FR-034, NFR-002.
- **AC-013 [pgTAP]** Given P's weekly update, When a **peer** attempts to insert/update it, Then it is
  denied — FR-011, NFR-002.
- **AC-014 [pgTAP]** Given P, When P attempts to insert a weekly update with `org_id` set to a **foreign
  org**, Then the insert is rejected by WITH CHECK — FR-006, NFR-003.
- **AC-015 [pgTAP]** Given P's update with status `draft`, When P updates `status` to `submitted`, Then
  the row's `submitted_at` is non-null after the write (trigger stamps it) and the status↔submitted_at
  CHECK holds — FR-013, FR-005, §3.4.
- **AC-016 [pgTAP]** Given P's update with status `submitted`, When P updates `status` back to `draft`
  (Reopen), Then `submitted_at` is cleared to NULL and the CHECK holds — FR-014, FR-005.
- **AC-017 [pgTAP]** Given any row, When a write attempts `status = 'submitted'` with `submitted_at`
  NULL (or `status = 'draft'` with `submitted_at` non-null), Then the CHECK constraint rejects it —
  FR-005, NFR-005.
- **AC-018 [pgTAP]** Given a write with `status` outside {draft, submitted} or a line `progress` outside
  {done, in_progress, blocked} or a blank line `label`, Then the CHECK constraint rejects it — FR-001,
  FR-004.

### RLS — uniqueness, line writes, cascade → **pgTAP**
- **AC-020 [pgTAP]** Given P already has a weekly update for `week_start` W, When P inserts a **second**
  update for the same (P, W), Then the UNIQUE(org_id, person_id, week_start) constraint rejects it —
  FR-002.
- **AC-021 [pgTAP]** Given P's **draft** update, When P inserts/updates/reorders/deletes an update
  **line** on it, Then it succeeds; When a **non-author** (manager or peer) attempts the same line
  write, Then it is denied — FR-016/017, FR-011, NFR-002.
- **AC-022 [pgTAP]** Given a weekly update is deleted, When its lines are queried, Then they are gone
  (ON DELETE CASCADE) — FR-007.
- **AC-023 [pgTAP]** Given P's **submitted** (locked) update, When P attempts to insert/update an update
  **line** without first reopening, Then it is denied (line writes require the parent to be the caller's
  own **and** in draft) — FR-015. *(If enforced via RLS predicate on parent status; the UI also renders
  the locked update read-only per AC-031.)*

### Week-key & Friday-due helpers (WIB) → **Unit (Vitest/RTL)**
- **AC-030 [unit]** Given `weekStartISO(now, offsetWeeks)` fed a fixed clock at WIB day boundaries
  (Mon 00:00 WIB, Sun 23:59 WIB, and the UTC instants straddling WIB midnight), Then it returns the
  correct Monday `YYYY-MM-DD` with no host-tz leak; `offsetWeeks = -1` returns the prior week's Monday —
  FR-003, NFR-004.
- **AC-031b [unit]** Given the on-time/late helper fed a `week_start` and a `submitted_at`, When
  `submitted_at` ≤ that week's Friday 17:00 WIB → **on-time**, else **late**, across the WIB boundary —
  FR-033, NFR-004.

### Write pane — states & validation → **Unit (Vitest/RTL)**
- **AC-031 [unit]** Given a **submitted** weekly update, When the write pane renders, Then the summary
  and lines are **read-only** and a **Reopen** action is shown (no edit affordances) — FR-013, FR-015.
- **AC-032 [unit]** Given a **draft** update, When the write pane renders, Then Save draft + Submit are
  **both** visible (co-located, mock IxD), summary + lines are editable — FR-012, mock-weekly-update.
- **AC-033 [unit]** Given a draft with **empty summary and zero lines**, When the pane renders, Then
  **Submit is disabled** while Save draft remains enabled; adding a non-empty line or summary enables
  Submit — FR-019.
- **AC-034 [unit]** Given the write pane, When the author adds an update line, edits its text, sets its
  **progress marker** (Done / In progress / Blocked), reorders it, or removes it, Then the UI reflects
  the change and the corresponding mutation is dispatched — FR-016, FR-017.
- **AC-035 [unit]** Given a draft, When the author clicks **Save draft**, Then a save mutation with
  `status = 'draft'` is dispatched and a quiet "Draft saved" confirmation shows (not a modal/toast
  interrupt) — FR-012, mock-weekly-update.
- **AC-036 [unit]** Given a non-empty draft, When the author clicks **Submit**, Then a submit mutation
  setting `status = 'submitted'` is dispatched and the pane transitions to the locked read-only state —
  FR-013.
- **AC-037 [unit]** Given a submitted update, When the author clicks **Reopen**, Then a mutation setting
  `status = 'draft'` is dispatched and the pane returns to editable — FR-014.
- **AC-038 [unit]** Given the write pane is loading → renders skeletons; on load error → renders an
  inline "Couldn't load your update — Retry" while the surface stays usable (degrades pane-by-pane per
  mock notes) — mock-weekly-update states.

### Manager review pane — roster, states, signal, empty → **Unit (Vitest/RTL)**
- **AC-040 [unit]** Given a manager with a team of N people and a selected week, When the review pane
  renders, Then it lists one row per team person with name + role, a summary excerpt (or "No update
  yet"), and a state pill — FR-030, FR-031.
- **AC-041 [unit]** Given mixed team states, When the pane renders, Then a submitted update → **Filed**,
  a draft → **Draft**, no row → **Not started**; and the summary counts (N filed · M draft · K not
  started) match the rows — FR-031, FR-032.
- **AC-042 [unit]** Given a filed update, When its row renders, Then it shows an **on-time vs late**
  signal derived from `submitted_at` vs the week's Friday 17:00 WIB — FR-033.
- **AC-043 [unit]** Given the review pane, When it renders, Then there are **no edit / acknowledge /
  comment** affordances on any reviewed update (read-only) — FR-034.
- **AC-044 [unit]** Given week navigation, When the manager moves to a **prior week**, Then the roster
  states recompute for that `week_start` — FR-035.
- **AC-045 [unit]** Given a manager whose team has **no updates** for the week, When the review pane
  renders, Then every row shows **Not started** and counts read "0 filed · 0 draft · N not started"
  (empty-but-valid state) — FR-031/032.
- **AC-046 [unit]** Given the review query errors, When the pane renders, Then it shows an inline
  "Couldn't load team updates — Retry" while the write pane stays usable (degrades pane-by-pane) —
  mock-weekly-update states.

### My Week weekly-update strip → **Unit (Vitest/RTL)**
- **AC-050 [unit]** Given the viewer has **no** update for the current WIB week, When My Week renders,
  Then the strip shows **No update** + "No weekly update for this week yet" + Due Fri \<date\> — FR-040,
  FR-042.
- **AC-051 [unit]** Given the viewer has a **draft** for the current week, Then the strip shows a
  **Draft** state; Given a **submitted** update, Then the strip shows **Submitted** plus an **on-time /
  late** indicator — FR-040, FR-041.

### Curated end-to-end journeys → **E2E (Playwright)** — 2 only
- **AC-090 [e2e]** **Write → submit → appears Filed in review.** Given an authenticated author with a
  manager, When the author writes their weekly update (summary + a line with a progress marker) and
  **Submits**, Then My Week's strip shows **Submitted** and the **manager**, viewing the team review for
  that week, sees the author's row as **Filed** with the summary excerpt — FR-012/013/030/031/040.
- **AC-091 [e2e]** **Reopen → edit → resubmit.** Given a submitted weekly update, When the author
  **Reopens** it, edits the summary / a line, and **re-Submits**, Then the update is editable in
  between, locks again on resubmit, and the manager review reflects the updated content for the same
  (person, week) — FR-013/014/015/017.

---

## 7. Error handling

| Condition | Layer | Behaviour |
|---|---|---|
| Non-author attempts to write an update or line (manager/peer) | RLS | Denied (0 rows); the manager review UI exposes no write affordance (FR-011/034, AC-012/013/021). |
| Peer / downward viewer reads an update | RLS USING | Zero rows — upward-only (AC-004/005). |
| Cross-org read or write | RLS USING / WITH CHECK | Zero rows / rejected (AC-007/014). |
| Second update for same (person, week) | DB UNIQUE | Rejected by UNIQUE(org_id, person_id, week_start) (AC-020). |
| `status` ⇎ `submitted_at` desync | DB CHECK + trigger | Rejected / auto-corrected (AC-015/016/017). |
| Invalid `status` / `progress` / blank line label | DB CHECK | Rejected (AC-018). |
| Edit attempted on a submitted (locked) update | UI + RLS | UI renders read-only with Reopen; DB denies line/summary writes until reopened (FR-015, AC-023/031). |
| Submit an empty update (no summary, no lines) | UI | Submit disabled; Save draft still allowed (FR-019, AC-033). |
| Write-pane load fails | UI | Inline "Couldn't load your update — Retry"; surface stays usable (AC-038). |
| Review list load fails | UI | Inline "Couldn't load team updates — Retry"; write pane stays usable (AC-046). |
| Manager's team is empty / no updates filed | UI | All rows "Not started"; counts "0 filed · 0 draft · N not started" (AC-045). |

---

## 8. Implementation checklist (build order; TDD red-green per CLAUDE.md)

**Schema / DB (pgTAP red first):**
- [ ] Migration `mos.weekly_updates` (§3.1): columns, `UNIQUE(org_id, person_id, week_start)`,
      status↔submitted_at CHECK, indexes `(org_id, week_start)` + `(person_id, week_start)`; reversible.
- [ ] Migration `mos.weekly_update_items` (§3.2): FK `weekly_update_id` ON DELETE CASCADE, `progress`
      CHECK, `label` non-blank CHECK, `position`.
- [ ] `BEFORE INSERT/UPDATE` trigger stamping/clearing `submitted_at` from the `status` transition
      (§3.4); `set_updated_at` triggers on both tables.
- [ ] Base grants: SELECT/INSERT/UPDATE to `authenticated` on both; line DELETE to `authenticated`
      (author-gated by policy) for line removal; **no** update DELETE path (updates soft-exist as draft).
- [ ] RLS enable+FORCE on both. `weekly_updates`: SELECT USING `org_id = current_org_id() AND (person_id
      = current_person_id() OR is_manager_of(person_id))`; INSERT/UPDATE author-only (`person_id =
      current_person_id()`, org-checked). `weekly_update_items`: SELECT/INSERT/UPDATE/DELETE gated via a
      `can_write_own_update(weekly_update_id)` / `can_read_update(weekly_update_id)` helper mirroring the
      parent's posture (and, for writes, parent status = draft per FR-015) — pattern mirrors P2-1
      `can_edit_task` + child-table policies.
- [ ] pgTAP suite covering AC-001..AC-023 — new `supabase/tests/18_..` onward (numbered after existing
      `17_mos_task_events.sql`): upward read (author/manager/grand-manager/dual-hat) vs peer/downward
      denial, cross-org, author-only write, manager-no-write, status-transition + submitted_at, unique,
      line gate, locked-edit denial, cascade.

**Lib / data layer (`mos-app/src/lib/`):**
- [ ] `week.ts`: add `weekStartISO(now, offsetWeeks = 0)` (Monday `YYYY-MM-DD`, WIB) + an on-time/late
      helper (`submitted_at` vs Friday-17:00-WIB of a `week_start`) — pure, clock-mockable (AC-030/031b).
- [ ] `lib/db/weeklyUpdates.ts` (mirrors `db/tasks.ts`, `supabase.schema('mos')`, never sends `org_id`,
      throws on PostgREST error): `getMyUpdate(weekStart)` (load-or-empty), `saveDraft`, `submit`,
      `reopen`, line add/edit/setProgress/reorder/remove, `getTeamUpdates(weekStart)` (review roster
      with per-person state, joining the manager's team from the directory/role chain + on-time/late).
- [ ] `database.types.ts` regenerated for the new `mos.*` tables.

**UI (`mos-app/src/pages/UpdatesPage.tsx` + components — to signed mockup, DESIGN.md tokens):**
- [ ] Replace `UpdatesPage` placeholder with the two stacked panes (write first, review second), single
      ~1080px column, week pill + prior-week navigation, page sub "write yours, then review your team's".
- [ ] Write pane: summary textarea, update-line rows (text + progress pill picker, reorder, remove),
      co-located Save draft + Submit (+ quiet "Draft saved" confirm), locked read-only + Reopen state,
      Submit-disabled-when-empty, skeleton/error states (AC-031..038). Reuse the StatusPill/progress-pill
      tinting tokens; consider extracting a shared ProgressPill if it diverges from StatusPill.
- [ ] Review pane (manager-conditional): roster rows ≥56px with Filed/Draft/Not-started pills, summary
      excerpt, submit time, on-time/late signal, summary counts, empty + error states (AC-040..046).
- [ ] My Week strip wiring: replace the static placeholder in `MyWeek.tsx` with live No-update / Draft /
      Submitted(+on-time/late) state for the current week, keeping Due Fri \<date\> + the Updates link
      (AC-050/051).

**E2E (`mos-app/e2e/` — 2 curated):**
- [ ] AC-090 write→submit→appears-Filed-in-review (author + manager). AC-091 reopen→edit→resubmit.

---

## 9. Owner-decision flags
**None.** All business rules are pre-decided in **OD-P2-10..14** (+ OD-P0-1, OD-P0-9, OD-P1-3 upward-only
read, OD-P1-4 WIB week + Fri 17:00 due, OD-P1-7 union manager chain) and encoded above with inline
citations. No open `[OWNER-DECISION]` remains for P2-2.

> The four mock-weekly-update "OPEN QUESTIONS" are all resolved by the locked ODs and recorded here, not
> re-opened: (1) Submit **locks** read-only with **Reopen** to revise — OD-P2-11 (FR-013/014). (2) Update
> lines are **free-text, no task FK** — OD-P2-10 (FR-004); no auto-pull of tasks. (3) Manager review
> scope is the **role-chain team** (`is_manager_of`, union), not a per-person `manager_id` — OD-P1-7
> (FR-030/036). (4) An inline "Remind"/nudge is **out of scope** — reminders are deferred and review is
> read-only — OD-P2-12/14 (FR-034).
>
> Implementation-detail note (not an owner decision): the locked-edit enforcement (FR-015) can live as
> an RLS predicate requiring the parent update's `status = 'draft'` for line writes, and/or a UI
> read-only render — an `eng-planner` mechanism choice; OD-P2-11 already fixes the rule.
