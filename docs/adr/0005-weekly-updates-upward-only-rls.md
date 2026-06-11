# ADR-0005 — Weekly-updates upward-only RLS + submit-lock mechanisms

- Status: Accepted (2026-06-12, P2-2 planning)
- Deciders: Owner (Arief) + Director
- Related: OD-P1-3 (fixed read posture — weekly updates upward-only), OD-P1-7 (union manager chain),
  OD-P2-10/11/12/13/14 (weekly-update model + lifecycle + read-only review), ADR-0001 (org seam +
  read posture + `is_manager_of`), ADR-0004 (`mos` PostgREST exposure + archive-gate trigger pattern),
  the spec `docs/specs/weekly-updates.spec.md` §3/§5/§6.

## Context

`mos.weekly_updates` (+ `mos.weekly_update_items`) is the **one non-org-readable** `mos` entity.
Unlike `mos.tasks` (org-readable — cross-unit visibility is the product), a weekly update is a
person-keyed recap readable by **its author and the author's manager chain only** — never peers,
never downward, never cross-org (OD-P1-3). It is the security-sensitive heart of the slice, and the
read/write/lock mechanisms are expensive to reverse, so they are settled here before the migration.

Four mechanism questions:

- **D1 — the read gate.** How is "author OR up-chain manager, org-scoped" expressed so the parent
  SELECT and the child (lines) SELECT share one definition?
- **D2 — the line submit-lock.** A submitted update is frozen; lines must become unwritable. Trigger
  or RLS predicate?
- **D3 — the summary submit-lock.** Same freeze for the parent summary, but Reopen (submitted→draft)
  must still pass. RLS cannot both allow Reopen's UPDATE and block a summary-only UPDATE on the same
  visible row.
- **D4 — `status` ↔ `submitted_at` integrity.** No write path may desync them.

## Decision

### D1 — Read gate: `mos.can_read_weekly_update(person_id)`, reusing `shared.is_manager_of`

```sql
create function mos.can_read_weekly_update(p_person_id uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$
  select shared.current_org_id() is not null
    and (p_person_id = shared.current_person_id() or shared.is_manager_of(p_person_id))
$$;
```

The parent SELECT policy is
`org_id = current_org_id() AND can_read_weekly_update(person_id)`; the line SELECT policy is
`org_id = current_org_id() AND EXISTS (parent WHERE can_read_weekly_update(parent.person_id))`. One
helper, two policies — mirrors ADR-0004's `can_edit_task`. It reuses `shared.is_manager_of`
**verbatim** (the recursive, cycle-safe union over all held roles, OD-P1-7) — no new chain logic.
**Cross-org isolation precedes the chain**: the explicit `org_id = current_org_id()` in each policy,
plus `is_manager_of`'s own org-scoping, means a foreign-org reader sees zero rows even if their role
shape would otherwise be a manager.

### D2 — Line submit-lock: RLS predicate on parent status (`mos.can_write_own_update`)

```sql
create function mos.can_write_own_update(p_weekly_update_id uuid) returns boolean ... as $$
  select exists (select 1 from mos.weekly_updates w
    where w.id = p_weekly_update_id and w.org_id = current_org_id()
      and w.person_id = current_person_id() and w.status = 'draft')
$$;
```

Line INSERT/UPDATE/DELETE are all gated by this. Chosen over a trigger because it mirrors ADR-0004's
`can_edit_task` child-table pattern exactly (one helper reused across child policies), is a single
provable gate, and **fails closed**: a submitted parent yields zero writable line rows. A trigger
would duplicate the author+draft check the policy already needs for INSERT and would not fire on rows
RLS already hid.

### D3 — Summary submit-lock: `BEFORE UPDATE` trigger `mos._guard_weekly_update_lock`

Mirrors ADR-0004's `_guard_archive`. If `old.status = 'submitted'` **and** `new.status <> 'draft'`
**and** `new.summary IS DISTINCT FROM old.summary` → raise `42501`. Reopen (`submitted`→`draft`)
passes; a summary edit on a still-submitted row is frozen. RLS alone cannot express this (it cannot
allow Reopen's UPDATE while blocking a summary-only UPDATE on the same visible row).

### D4 — `status` ↔ `submitted_at`: CHECK + `_stamp_submitted_at` trigger

(a) `CHECK ((status = 'submitted') = (submitted_at IS NOT NULL))` rejects any desynced literal write.
(b) `BEFORE INSERT OR UPDATE` trigger `mos._stamp_submitted_at` owns the timestamp — into `submitted`
sets `submitted_at = now()` when NULL; on `draft` forces it NULL. The data layer sets `status` only.

### Writes

Parent INSERT/UPDATE are **author-only** (`person_id = current_person_id()`, org-checked); no DELETE
grant or policy (updates soft-exist as draft). Managers **read but never write** (review is
read-only, OD-P2-12). Lines get a DELETE grant + author+draft policy (line removal is a real edit).

## Consequences

- Managers read, never write — the upward-only read + author-only write split is provable in pgTAP
  (the full author / direct-mgr / grand-mgr / dual-hat-union / peer-denied / downward-denied /
  cross-org matrix, files 18–22).
- Reuses `shared.is_manager_of` — no second chain implementation to keep correct.
- Lines fail closed when the parent is submitted; the UI also renders the locked update read-only.
- A future task↔update FK is additive (a nullable `task_id` on the line), no posture change.
- The mechanism split (RLS for the line lock, trigger for the summary lock) is asymmetric by
  necessity (D3) — documented here so it is not "simplified" into one mechanism later.

### Performance accept
The line SELECT policy evaluates `can_read_weekly_update` (→ recursive `shared.is_manager_of`) once
per candidate row. **Acceptable at first-slice team sizes** (~15 people; a review roster is a handful
of rows, and `roles_reports_to_role_idx` + the `person_roles` indexes back the recursion). Revisit
only if review rosters reach the hundreds — options then: a materialized/cached manager-chain, a
`STABLE` per-statement memoization, or denormalizing the readable-by set. Not warranted now.
