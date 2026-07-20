# ADR-0052 — Structured authored content adjunct and trusted typed embeds

- **Status:** Proposed; owner approval is required at the V3 Issue 10 storage gate before the
  migration in this ADR is applied.
- **Date:** 2026-07-20
- **Deciders:** Director, with the owner gate defined by `docs/specs/v3-redesign.spec.md` §12.
- **Scope:** V3 Issue 10 only: the authored-content contract, additive storage/RLS, the shared
  editor/viewer seam, and typed embeds. This ADR does not create a Standard/SOP runtime or move
  routes.

## Context

V3 needs Notion-like writing naturalness inside a bounded MOS record surface. The product also needs
operational truth that remains queryable, permissioned, auditable, and safe to use in Tasks, Signals,
Process Runs, and future Standards. OD-REDESIGN-74 and OD-REDESIGN-77 therefore require a shared
RecordViewer grammar over separate typed domain models, with authored composition separated from
normalized business state.

The current repository confirms the boundary:

- `mos.tasks` and `mos.task_checklist_items` are live, normalized models. Task ownership, status,
  due date, lifecycle, and checklist completion are not document content.
- `mos.signals` and its revision/visibility tables are live, normalized models. Signal `body`,
  author, Team, occurred time, attention, correction, acknowledgement, and linked Tasks remain
  Signal truth; they are not moved into an authored document.
- `mos.work_lines`, `mos.process_task_defs`, and `mos.process_runs` are live Process models, but
  the V3 RecordViewer content adapter for them is not yet shipped.
- There is no live `mos.standards` table, Standard type, Standard renderer, or SOP editor in the
  current tree. `Standard`/`SOP` is a domain extension point, not a supported Issue 10 record kind.
- `mos.user_views` is useful prior art for a tenant-scoped validated JSONB row, but it stores a
  user's view composition, not content attached to a domain record.

### Domain grill outcome

The evidence-led grill resolves the following decisions before implementation:

| Question | Decision | Reason |
|---|---|---|
| Authored content or normalized truth? | Authored paragraphs, headings, lists, links, callouts, content-only checklists, and typed embed placement live in a versioned document. Ownership, status, due dates, relations, Task checklist rows, Process Run state, evidence, measurements, sign-off, and history remain normalized. | Queryability, lifecycle, RLS, audit, and cross-surface consistency require domain truth to stay in typed tables. |
| What can own an authored document now? | `task` is the Issue 10 persisted content owner because `mos.tasks` is live and already has a legacy description surface. `signal` is a typed reference target; its factual `body` stays normalized and is not replaced by JSONB. | This proves the contract with a real domain without inventing a Signal notes model or duplicating Signal truth. |
| What can be referenced now? | `task` and `signal` references are active because both have live rows and current RLS-backed loaders. A live Task checklist embed is active. | A reference stores only a typed target, never a copied title, status, checklist, or permission result. |
| What is future-only? | Process/Process Run content adapters and Standard/SOP blocks are extension points. `standard`, `standard_step`, measurement, evidence, and sign-off embeds are rejected until a real model, adapter, route, and permission contract exist. | The current tree cannot prove a Standard/SOP runtime. Fail-closed is safer than a fake record or guessed schema. |
| How are edits versioned? | Every persisted document has `schemaVersion: 1`; block and checklist-item IDs are stable; an explicit migration registry handles known older documents and rejects unknown future versions. | Reordering and later schema changes must not silently change identity or discard content. |
| How is the renderer trusted? | One canonical, versioned V1 schema contract is represented by the ADR/types/limits and a shared golden valid/invalid fixture set. TypeScript validates for fast client feedback and before rendering; PostgreSQL validates independently and is authoritative for writes. Deterministic parity tests execute the same fixtures against both implementations. | This follows ADR-0017 D5, ADR-0045, and ADR-0049: invalid or retired content degrades safely and never reaches an unvalidated renderer. |
| How do panel and page differ? | One `RecordContentDocument` and one editor/viewer implementation serve both. `panel` is short, fast inspection/editing; `page` provides the wider long-writing measure. | OD-REDESIGN-78 forbids two editors with different semantics. |

## Decision

### D1 — Use a typed authored-content adjunct, not a universal record table

Add one bounded adjunct row per content-capable record in `mos.record_contents`. The row owns only
the authored document and its revision metadata. It does not own a title, status, Team, PIC,
Supervisor, due date, relationship, permission, lifecycle, or copied read model. The discriminator
is an allow-list of content-capable kinds, not a catch-all record registry.

The V1 TypeScript contract is:

```ts
export type RecordContentKind = 'task'
export type EmbedRecordKind = 'task' | 'signal'
export type BlockId = string

export interface RecordContentDocument {
  schemaVersion: 1
  blocks: RecordContentBlock[]
}

export type RecordContentBlock =
  | { id: BlockId; type: 'paragraph'; text: string }
  | { id: BlockId; type: 'heading'; level: 2 | 3; text: string }
  | { id: BlockId; type: 'bulleted_list'; items: ContentListItem[] }
  | { id: BlockId; type: 'numbered_list'; items: ContentListItem[] }
  | { id: BlockId; type: 'link'; text: string; href: string }
  | { id: BlockId; type: 'callout'; tone: 'info' | 'warning' | 'success' | 'neutral'; text: string }
  | { id: BlockId; type: 'content_checklist'; items: ContentChecklistItem[] }
  | { id: BlockId; type: 'embed'; embed: RecordReferenceEmbed | TaskChecklistEmbed }

export interface ContentListItem { id: BlockId; text: string }
export interface ContentChecklistItem { id: BlockId; label: string; done: boolean }

export interface RecordReferenceEmbed {
  kind: 'record_reference'
  target: { recordKind: EmbedRecordKind; recordId: string }
  presentation: 'inline' | 'card'
}

export interface TaskChecklistEmbed {
  kind: 'task_checklist'
  target: { recordKind: 'task'; recordId: string }
  presentation: 'live'
}
```

The union is intentionally shallow: a callout has text, not arbitrary nested blocks, and an embed
has a typed target, not an executable query or a custom component name. Stable IDs are opaque strings
of 1–64 ASCII letters, digits, `_`, or `-`; the editor generates UUIDs, while a compatibility
conversion may use the deterministic `legacy-description-v1` ID. IDs are unique across blocks and
nested list/checklist items in one document and are never regenerated during reorder.

The ADR-0052 V1 union, limits, Object Contract rules, and URL policy are the canonical schema
contract. `mos-app/src/lib/structured-content/content-types.ts` is its executable TypeScript
representation; PostgreSQL has a separate implementation of the same contract because it cannot
execute TypeScript. The shared golden fixtures at
`supabase/tests/fixtures/record-content-golden.json` are run through the TypeScript validator and
through the SQL validator/parity harness. A fixture that differs in acceptance or stable error code
fails the parity gate. TypeScript validation is fast feedback; the SQL validator inside the save RPC
is authoritative for persistence.

The initial hard limits are part of the contract:

| Limit | V1 value |
|---|---:|
| Encoded JSONB document | 262,144 bytes |
| Blocks | 200 |
| List or content-checklist items in one block | 100 |
| Typed embed blocks | 50 |
| Text-bearing field | 4,000 characters |
| Link `href` | 2,048 characters |
| Block or item ID | 64 characters |
| Recursive nesting | none beyond the single `embed` payload |

Text is stored as text. The renderer does not parse Markdown and does not pass any value to
`dangerouslySetInnerHTML`. Links accept `http:`, `https:`, `mailto:`, and app-relative URLs after
normalization; `javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative URLs, malformed
URLs, and control characters are rejected. External anchors use the safe target/rel combination
specified by the shared link helper.

### D2 — Store current documents and append-only revision snapshots separately

The additive migration creates these two `mos` tables:

```text
mos.record_contents
  id uuid primary key
  org_id uuid not null default shared.current_org_id()
  record_kind text not null check (record_kind = 'task')
  record_id uuid not null
  schema_version smallint not null check (schema_version = 1)
  document jsonb not null
  revision bigint not null default 1 check (revision > 0)
  created_by uuid not null default shared.current_person_id()
  updated_by uuid not null default shared.current_person_id()
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
  unique (org_id, record_kind, record_id)

mos.record_content_revisions
  id uuid primary key
  content_id uuid not null references mos.record_contents(id)
  org_id uuid not null
  record_kind text not null
  record_id uuid not null
  revision bigint not null
  document jsonb not null
  actor_id uuid not null
  operation text not null check (operation in ('created', 'updated'))
  created_at timestamptz not null default now()
  unique (content_id, revision)
```

`record_contents` has no polymorphic foreign key because a foreign key to several separate domain
tables is not expressible without a universal record table. A target guard in the migration accepts
only `task`, requires the Task row to exist in the caller's `org_id`, and pins `org_id`, `record_kind`,
and `record_id` for the lifetime of the row. The guard fails closed for every other kind. Future
Process, Process Run, Signal-authored-content, or Standard support requires a separate reviewed
adapter and migration that adds its target/permission mapping; it cannot be enabled by changing a
client union.

An after-write trigger records the new document and revision in `record_content_revisions`. The
revision table is a bounded full-snapshot audit trail, not a second current document. Revert, when
needed later, is another validated save through the same RPC, so history remains linear and
auditable. Authenticated users have no insert, update, or delete privilege on the revision table.

### D3 — Gate writes through one optimistic-concurrency RPC and keep RLS fail-closed

Both tables have RLS enabled and forced. `record_contents` and `record_content_revisions` have
org-first SELECT policies. The read helper maps the current V1 kind to the existing domain read
contract: Task content is visible only when the caller can read the same-org Task row. There is no
authenticated table INSERT, UPDATE, or DELETE policy and no authenticated table write grant. The
only browser write is:

```text
mos.save_record_content(
  p_record_kind text,
  p_record_id uuid,
  p_document jsonb,
  p_expected_revision bigint
)
```

The function is a narrowly scoped `SECURITY DEFINER` RPC because it must lock and validate the
current row, write the current snapshot, and let the trigger write history atomically. It uses
`set search_path = ''`, is executable only by `authenticated`, and never accepts a service-role
secret or caller-supplied `org_id`, `created_by`, `updated_by`, or revision. Before writing it:

1. obtains `shared.current_org_id()` and `shared.current_person_id()` from the authenticated JWT;
2. accepts only `p_record_kind = 'task'`;
3. verifies that the target Task exists in the current org and that the caller passes the canonical
   Task permission contract delivered by Issues 5–9: PIC, Supervisor, or the relevant manager. If
   the existing SQL helper still reads `responsible_person_id` or `accountable_person_id`, those are
   legacy storage/helper inputs translated at the DAL/SQL boundary only; they are not active UI or
   domain vocabulary;
4. validates document shape, schema version, block union, IDs, limits, and URL policy again in the
   database-side validator;
5. locks the current content row, compares `p_expected_revision`, and returns a typed `saved` result
   or a `conflict` result. The current revision/document is included only after the caller still
   passes the content read gate; otherwise the RPC returns a generic authorized conflict/error with
   no current document or target details. It never silently merges drafts;
6. writes the row with server-derived actor/org/revision values.

Any `SECURITY DEFINER` read/permission/validation helper and the history trigger also pins
`search_path = ''`, revokes EXECUTE from `PUBLIC` and `anon`, and exposes only the minimum
`authenticated` execution needed by the policy or RPC. Actor and org identity always come from the
authenticated request claims, never from document JSONB or caller parameters.

The app DAL calls the RPC after the pure TypeScript validator has provided fast feedback. A direct
PostgREST write is denied even if a caller bypasses the UI. The TypeScript and PostgreSQL validators
are separate implementations of the canonical contract, and the shared golden fixture parity suite
must run both. RLS and the RPC both test the org boundary; a same UUID in a different org is not a
valid target. The revision SELECT policy uses the same read helper, so an unauthorized actor cannot
use history or a conflict response as a data side channel.

### D4 — Use one shared viewer/editor and a typed embed registry

The shared structured-content code owns the document types, validator, migration registry, link
policy, renderer, editor state, and embed dispatch. Domain adapters supply the record identity,
content capability, read-only state, and RLS-backed loaders. The Issue 10 Task integration consumes
the existing Task surface; it does not create a second RecordViewer or change the shared overlay,
route, collection, Task lifecycle, Signal capture, or Process runtime.

The active embed registry contains:

- `record_reference` for a live Task or Signal, resolved through the current Task/Signal DAL and
  rendered as an inline or compact card. The JSONB stores only kind and ID.
- `task_checklist` for a live Task, rendered from `mos.task_checklist_items`. Toggle, add, reorder,
  and delete actions call the existing Task checklist DAL/RLS. They never update the authored
  document, and the document stores no copied labels or completion values for that embed.

The registry has no Standard/SOP entry. A future Standard step may become a typed embed only after a
real Standard row model, Object Contract, route/viewer adapter, permission mapping, normalized
measurement/evidence/sign-off tables, and acceptance tests exist. An unknown or retired embed is
shown as an unavailable reference if its document is otherwise valid; an unknown block or malformed
document fails the whole document closed and shows the safe content-error state.

The editor exposes the same `panel` and `page` contract: local draft, stable IDs, keyboard handling,
explicit `Saving`/`Saved`/`Validation error`/`Save failed`/`Conflict` states, retry, read-only
presentation, and Escape-to-last-saved. Panel mode keeps the short-edit affordance compact; page mode
uses the wider writing measure. Both call the same save function and render the same document.

### D5 — Preserve the legacy Task description without dual-writing it

The migration is additive and does not rewrite existing `mos.tasks.description` values. Until a
Task has a `record_contents` row, the Task content adapter converts a non-empty legacy description
to an in-memory V1 document with one paragraph. On the first successful authored save, the new row
becomes authoritative for the content section; the legacy column remains intact for rollback and
older clients but is no longer rendered alongside the JSONB document. No Issue 10 code writes both
representations.

This avoids a destructive backfill and avoids silently classifying Signal `body` or Process template
descriptions as authored content. Later cleanup may remove the legacy Task field only after every
writer has migrated and a separate migration has an explicit owner-approved rollback path.

### D6 — Version documents explicitly and reject incompatible versions

V1 is the only persisted schema version. `migrateRecordContentDocument` accepts a validated V1
document and the explicit legacy Task-description conversion; it rejects an unknown lower version
without a registered migration and rejects every higher version as read-only incompatible content.
The migration registry is keyed by source and target version, is covered by tests, and never guesses
how to rename or discard a block. A future schema migration must preserve stable IDs where semantics
are unchanged, be additive or explicitly reversible, and update the database-side validator in the
same reviewed change.

## Alternatives considered

1. **Put a JSONB document on every domain table.** Rejected. It couples authored composition to
   Task, Signal, Process, and future Standard schemas, makes permission/history behavior diverge,
   and invites duplicate fields. The adjunct preserves separate typed models while allowing one
   editor.
2. **Use a Markdown or HTML body column.** Rejected. It cannot express safe typed embeds or stable
   block identity, encourages raw-HTML/XSS paths, and makes normalized checklist state look like
   prose.
3. **Create `mos.records` and attach every object to it.** Rejected by OD-REDESIGN-74. It is a
   universal record table in disguise and would flatten distinct lifecycle, validation, ownership,
   and RLS contracts.
4. **Put authored content in `shared.people` or `mos.user_views`.** Rejected. A person's row is not
   a content owner and `user_views` is private/shared presentation configuration, not record truth.
5. **Create a separate editor and storage table for each domain.** Rejected for V1. It would repeat
   the block validator, history, limits, and security surface before the domain differences require
   it. New domain adapters may add typed target mappings later without changing the V1 Task row.
6. **Allow arbitrary block JSON, custom components, or user-authored code.** Rejected. The Object
   Contract and renderer registry are code-owned; the document has no component import, query, SQL,
   HTML, CSS, or script escape hatch.

## Migration and reversibility

The forward migration is additive: create the two tables, indexes, validation/permission helpers,
save RPC, history trigger, grants, and forced RLS policies. It does not alter or delete Task, Signal,
Process, or Standard data and does not backfill legacy descriptions. The migration includes manual
down SQL in reverse dependency order. A rollback procedure is:

1. stop the structured-content writer and preserve the last `record_contents` and revision export;
2. remove the Task content adapter so legacy `tasks.description` is visible again;
3. drop the RPC, trigger, policies, helper functions, indexes, revision table, and current-content
   table in dependency order;
4. verify Task/Signal/Process rows and their existing RLS tests are unchanged.

Because the old Task description remains untouched, this rollback returns the pre-JSONB data surface.
New authored content is recoverable from the revision export; dropping the new tables without that
export is not an approved rollback procedure.

## Compatibility and failure behavior

- Older clients continue to read/write the legacy Task description. They cannot write the new table
  because authenticated table writes are denied. The V3 client prefers a validated content row when
  one exists, so old-client edits do not silently overwrite authored content.
- A missing content row is not an error; the Task adapter shows the legacy description or an empty
  content state. A malformed legacy string is rendered as literal text, never parsed as markup.
- An invalid persisted JSONB document, unknown block, duplicate ID, over-limit value, or unsupported
  schema version is not partially rendered or auto-repaired. The viewer reports a safe content error
  and leaves the original row untouched.
- An unreadable, missing, archived, or retired typed target renders an unavailable reference without
  exposing its title, status, or existence details. A typed embed action remains disabled when the
  caller lacks the target permission.
- A stale `p_expected_revision` returns a conflict. If the caller remains authorized to read the
  content, the response includes the current revision/document; otherwise it contains no current
  document or target details. The editor keeps the user's draft and requires an explicit
  reload/discard or re-edit decision; last-write-wins is not used.
- `standard`, `standard_step`, Process content, measurement, evidence, sign-off, and any unknown
  future kind are rejected by the V1 contract. No fake Standard/SOP row or test fixture is part of
  this issue.

## Consequences

Positive consequences:

- One bounded content model can be rendered in Task panel and page modes without another editor.
- Operational Task checklist state and future Standard controls stay queryable, permissioned, and
  auditable in their existing tables.
- Client and database validators share a fail-closed allow-list, URL policy, size limits, and version
  boundary.
- Revision snapshots make content history and conflict handling explicit without changing Task event
  or Signal correction semantics.
- Adding Standard/SOP later requires a real domain adapter and migration rather than a speculative
  universal schema.

Costs and risks:

- The polymorphic `record_kind`/`record_id` pair cannot use one foreign key, so the target guard and
  permission mapping must be extended deliberately for every future kind.
- Full revision snapshots consume bounded storage proportional to document size; the hard document
  limit keeps the worst case reviewable.
- Legacy Task descriptions remain during the compatibility window, so cleanup requires a later
  owner-approved migration after old writers are gone.
- A conflict asks the user to choose how to proceed instead of silently merging arbitrary blocks.

## Verification ownership

Issue 10 owns the V1 Task content path, validator/migrator/link tests, Task-reference and live Task
checklist embed tests, the additive migration, `supabase/tests/101_mos_record_content_rls.sql`, and
the panel/page browser evidence. Issue 10 does not claim Standard measurement acceptance, Signal body
migration, Process/Process Run authored content, Issue 9 owner acceptance, or Issue 11 route
migration. The implementation plan is [docs/plans/2026-07-20-v3-structured-content.md](../plans/2026-07-20-v3-structured-content.md).

## Owner-ratification items

There are no unresolved product or domain decisions in this ADR. The existing V3 gate still requires
the owner to approve this ADR before the migration touches storage. Standard/SOP activation is a
future design decision gated on a live Standard model; it is intentionally not an Issue 10 choice.

## References

- `docs/specs/v3-redesign.spec.md` §6.3, §6.6, §6.7, §11 AC-V3-010/011, and §12 Issue 10.
- `docs/decisions.md` OD-REDESIGN-74, OD-REDESIGN-77, and OD-REDESIGN-78.
- `CONTEXT.md` Object Contract, Task, Signal, Process, Process Run, and Standard vocabulary.
- `docs/adr/0017-agent-native-user-composed-ui.md` D5/D6 trusted-renderer and validated JSONB
  patterns; `docs/adr/0019-ia-north-star.md` D6 structured block storage; `docs/adr/0025-ia-modules-in-rail-redesign-direction.md` D3/D6/D13/D16; `docs/adr/0045-typed-transcript-widgets.md`; and `docs/adr/0049-safe-assistant-markdown-rendering.md`.
- `supabase/migrations/20260611000007_mos_tasks.sql`, `20260611000008_mos_task_children.sql`,
  `20260611000009_mos_rls.sql`, `20260716000002_mos_signals.sql`,
  `20260716000003_mos_signals_rls.sql`, `20260716000010_mos_process_definitions.sql`, and
  `20260716000011_mos_process_runs.sql`.
