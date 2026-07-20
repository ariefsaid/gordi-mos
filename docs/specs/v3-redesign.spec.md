# V3 Redesign — One Visual and Interaction System

**Status:** Draft for owner sign-off  
**Era:** E8 / V3  
**Branch:** `v3-redesign`  
**Owner decisions:** OD-REDESIGN-72..79  
**Historical inputs:** E7 visual references, all mockup lost-good evidence, the 50+ Q&A, the
frustration/buildout record, `docs/jtbd.md`, `docs/experience-contract.md`, and
`docs/interaction-contract.md`

## 1. Outcome

V3 makes MOS read and behave as one application. It preserves E7's visual language while replacing
the surviving pre-E7 page/component styling and correcting the fragmented IA and interaction grammar.
Different business objects remain distinct domain models, but they compose the same page families,
record/collection systems, field components, navigation behavior, and visual foundation.

## 2. Authority and precedence

When sources disagree, V3 uses this order:

1. Current owner decisions, including OD-REDESIGN-72..79.
2. Current domain law in `CONTEXT.md`, current ADRs, and security/authorization contracts.
3. `docs/jtbd.md`, the Experience Contract, and the Interaction Contract.
4. Lost-good behavior or presentation from earlier mockup generations that no later owner decision
   superseded.
5. E7 as the visual styling reference.
6. Existing implementation only as evidence of current behavior, never as proof of design acceptance.

E7 owns visual language, not IA/IxD. Current owner law owns structure and behavior.

## 3. Problem statement

The current branch changed the shell and some isolated components, but most routes still carry
different typography, spacing, sizing, page anatomy, controls, record presentations, and overlay
behavior. The repository itself contains 72 component/page CSS files, widespread literal type sizes,
multiple button/select/modal implementations, and route-specific page grammars. Green component tests
therefore coexist with an app that still feels like several products.

The corrective unit is not an individual page. It is a reusable visual and interaction system whose
consumers are migrated together.

## 4. Goals

- Port E7's visual styling consistently across every live user-facing route.
- Establish shared page families without making every page identical.
- Establish one RecordViewer grammar over separate typed domain models.
- Establish one RecordCollection/view system with object-specific presentations.
- Establish one overlay, focus, Back, URL, create, and inline-edit grammar.
- Support Notion-like direct editing and structured authored content without creating a freeform
  database model.
- Preserve both fronts: manager efficiency and floor-member obviousness.
- Make visual and interaction conformance measurable through rendered and driven checks.
- Tie every remaining debt to backlog, specification, plan, acceptance criterion, and owning test.

## 5. Non-goals

- A new visual identity or brand exploration.
- Copying E7's IA/IxD wholesale.
- Copying Twenty, Notion, or ClickUp components or tables.
- One universal database table for all records.
- A user-defined database-schema/custom-field builder.
- A whole-app big-bang rewrite before the representative slice is approved.
- Replacing domain permissions, validation, lifecycle, or normalized operational records with JSONB.
- Deploying or merging without the normal owner/review gates.

## 6. Design architecture

### 6.1 Visual foundation

E7's composed visual result is the reference for typography, spacing, sizing, density, surfaces,
borders, radii, elevation, controls, tables/lists, panels, and states. `DESIGN.md` must be reconciled to
that result rather than used to justify existing pre-E7 presentation. Storybook becomes the component
workbench promised by `docs/product-expectations.md`, containing the complete state and responsive
matrix for every V3 primitive.

Raw page-local type/spacing values are migrated to a documented semantic scale. A route may not define
its own page title, field, button, table, list-row, dialog, drawer, empty/loading/error, or save-feedback
grammar when a V3 primitive owns that job.

### 6.2 Shared page families

Every route declares exactly one primary family:

- **Workspace:** scanning, filtering, grouping, acting on, and opening many records.
- **Focused record:** viewing, writing, editing, or deciding on one record.
- **Management:** maintaining people, catalogs, definitions, and settings.

Operational modules may provide specialized bodies and actions, but use the same page frame, heading,
spacing, control, state, and responsive systems. They are not separate design systems.

### 6.3 RecordViewer

RecordViewer is a shared presentation/editing contract, not a shared database model. Each domain
adapter supplies:

- identity and type;
- ordered typed metadata and relationships;
- content sections and allowed embedded blocks;
- activity/history;
- available actions and permission state;
- object-specific sections or renderers.

RecordViewer supplies:

- E7 visual anatomy;
- common property display/edit components;
- relation and linked-record treatment;
- saving/saved/error/retry feedback;
- read-only presentation;
- panel/page modes using the same content;
- focus, keyboard, Back, and canonical-URL behavior.

"Similar, not same" is binding. A Task and Standard/SOP use the same grammar but retain different
field order, hierarchy, content sections, validation, actions, and database models.

### 6.4 RecordCollection

One collection engine owns query/view state, search, filtering, sorting, grouping, saved views,
selection, pagination readiness, loading/error/empty behavior, URL persistence, and record opening.
Object contracts declare valid fields, filters, grouping choices, and presentations.

Supported presentation adapters include Feed, Table, Triage Queue, Board, Calendar, and Library.
Not every object supports every adapter. The default presentation remains job-first and simple;
manager controls are progressively disclosed. Operational modules consume filtered collections rather
than implementing parallel lists.

### 6.5 Overlay and navigation grammar

- Search/command launcher: centered and temporary.
- Record click from a collection: wide right-side RecordViewer panel preserving list context.
- Linked-record navigation: pushes within the same panel stack.
- Full-page action, direct URL, refresh, bookmark, or new tab: full canonical RecordViewer page.
- Deputy: the same right-panel host and stack, never a competing drawer.
- Create: RecordViewer new-record mode; compact centered composer permitted for capture-first Signals.
- Confirmation: one centered blocking-dialog primitive.
- Menu/picker: anchored to its trigger.
- Phone/narrow width: panels become full-screen with the same content and Back contract.

Close, Escape, browser Back, internal Back, focus entry, and focus return are behavioral acceptance
criteria, not implementation details.

### 6.6 Direct editing

Authorized viewers edit metadata and content in place. There is no separate general edit page or
view/edit mode. Enter, Tab, or click-outside commits supported field edits; Escape restores the saved
value. The surface visibly reports Saving, Saved, validation failure, and retry. Unauthorized viewers
receive the same information hierarchy in an honest read-only state. Archive, publish, approve,
retract, and similar lifecycle actions remain explicit.

### 6.7 Structured authored content

Each supported record may have a schema-versioned JSONB document containing allow-listed blocks with
stable identifiers. Initial content primitives are paragraph, heading, bulleted list, numbered list,
link, callout, simple content checklist, and typed reference/embed. The object contract determines
which blocks are valid.

Normalized tables remain authoritative for operational/queryable state. Task checklist completion,
Standard steps, measurements, evidence, sign-off, and relations remain domain records and may be
rendered through typed embeds. JSONB never duplicates their authoritative state. The schema requires
a dedicated ADR, reversible migration, RLS/security review, and version-migration tests.

## 7. Provisional information architecture

The representative slice uses:

- Home — today's attention and orientation.
- Work — durable records and saved views.
- Events — time/calendar lens.
- Money — role-gated financial workspace.
- Inbox — full triage destination; bell opens its quick panel.
- Café / Ecommerce / Roastery — role-relevant operational workspaces over canonical records.
- Profile / Administration — secondary settings and management.

This remains provisional per OD-REDESIGN-76. The owner ratifies it only after driven manager and floor
journeys on the representative slice.

## 8. Representative V3 gate

Before broad migration, V3 proves the system on:

1. Home — orientation/attention page family.
2. Tasks — dense RecordCollection plus RecordViewer panel/page.
3. Signals — Feed/Table collection plus capture and RecordViewer.
4. Inbox — Triage Queue plus bell quick panel and record stack.
5. Café — operational context over canonical Tasks/records, including explicit Team selection.
6. One management surface — Profile or People using the management family.

The gate includes Director/manager and floor-member personas at desktop, intermediate, and phone
widths. Owner approval of this rendered, driven slice is required before remaining routes migrate.

## 9. Functional requirements

- **FR-V3-001:** When any live route renders, the system shall use exactly one declared V3 page family.
- **FR-V3-002:** When analogous controls or states render across routes, the system shall use the same
  V3 primitive and semantic visual tokens.
- **FR-V3-003:** When a supported domain record is opened, the system shall render its type-specific
  contract through RecordViewer without converting its database model.
- **FR-V3-004:** When a record is opened from a collection at desktop width, the system shall open a
  wide right-side panel while retaining usable collection context.
- **FR-V3-005:** When a record is opened directly, refreshed, bookmarked, opened in a new tab, or
  explicitly expanded, the system shall render the same RecordViewer on its canonical full page.
- **FR-V3-006:** When related records are opened from a panel, the system shall push them on one panel
  stack and provide Back without opening a second competing drawer.
- **FR-V3-007:** When a collection changes presentation, its filters, sorting, grouping, saved-view
  identity, and selected record semantics shall remain coherent and URL-persisted where applicable.
- **FR-V3-008:** When a viewer lacks permission to edit a field, block, or action, RecordViewer shall
  show a read-only state without disabled-input styling or fake affordances.
- **FR-V3-009:** When an authorized viewer edits a supported field or content block, the system shall
  expose consistent commit/cancel and Saving/Saved/error/retry feedback.
- **FR-V3-010:** When authored content is saved, the system shall validate the block document against
  the object contract and schema version before persistence.
- **FR-V3-011:** When an operational object is embedded in authored content, the system shall render a
  reference to normalized authoritative state rather than duplicating it in JSONB.
- **FR-V3-012:** When Inbox, Deputy, records, composer, confirmation, menus, or pickers open, the system
  shall select the overlay behavior defined by its interaction job, not by its module.
- **FR-V3-013:** When a role-affiliated module lists a canonical object, it shall consume the shared
  RecordCollection and RecordViewer rather than a duplicate implementation.
- **FR-V3-014:** When a floor-member default renders, work shall appear before collection configuration;
  manager view controls shall remain discoverable without dominating the default.
- **FR-V3-015:** When an E7 visual reference and existing app styling differ, the V3 implementation
  shall follow E7 unless a later owner decision explicitly overrides it.

## 10. Non-functional requirements

- **NFR-V3-001:** WCAG 2.2 AA contrast, focus visibility, names/roles/states, and keyboard operation.
- **NFR-V3-002:** No new production UI dependency without an explicit plan rationale and license check.
- **NFR-V3-003:** Changed-code line coverage remains at least 80%; tests assert user outcomes.
- **NFR-V3-004:** Typecheck and ESLint complete with zero errors/warnings at each issue gate.
- **NFR-V3-005:** Rendered review covers at least 1280px, an intermediate panel regime, and 390px.
- **NFR-V3-006:** No horizontal page overflow at 390px; touch targets are at least 44×44px where
  required by the Experience Contract.
- **NFR-V3-007:** One canonical component implementation per interaction/component job; migrations
  remove superseded consumers and styles within the same issue.
- **NFR-V3-008:** Schema additions are reversible, RLS-protected, and fail closed.
- **NFR-V3-009:** V3 changes never mutate production/staging data during review.

## 11. Acceptance criteria

- **AC-V3-001:** Given the representative routes at desktop and phone widths, when computed styles are
  compared across page heads, body type, controls, rows, panels, dialogs, and states, then each semantic
  role uses the same V3 values and the rendered result matches the E7 visual reference.
- **AC-V3-002:** Given Tasks, Signals, Inbox, and Café, when each collection opens a record, then the
  same panel side, width family, focus entry, Escape/Close/Back behavior, and page-escalation outcome
  occur.
- **AC-V3-003:** Given a record panel already open, when Deputy or another record is opened, then the
  shared host stacks or replaces content according to the journey and never renders two overlapping
  side panels.
- **AC-V3-004:** Given a Task in Work and the same Task in Café, when each is opened, then both resolve
  to the same record identity and RecordViewer while preserving the source collection on close.
- **AC-V3-005:** Given a Signal Feed saved view, when presentation changes to Table and the page is
  refreshed, then supported filters, sort, grouping, and saved-view identity persist.
- **AC-V3-006:** Given Inbox on desktop, when the bell is invoked, then quick triage opens in the shared
  host; opening a notification pushes its canonical record; Back returns to triage; Close returns focus
  to the bell. Given phone, the bell opens the full Inbox route.
- **AC-V3-007:** Given a multi-Team viewer entering Café, when more than one valid Team exists, then the
  system requires an explicit context choice and never silently chooses the first Team.
- **AC-V3-008:** Given an authorized user editing a property, when they commit or cancel, then every
  RecordViewer consumer follows the same save/discard feedback contract.
- **AC-V3-009:** Given an unauthorized viewer, when the same record opens, then its information hierarchy
  remains readable while edit and lifecycle actions are absent or honestly explained.
- **AC-V3-010:** Given authored JSONB content containing valid paragraph/list/link/content-checklist
  blocks, when saved and reopened in panel and page modes, then block identity, order, and content are
  preserved and rendered by the same components.
- **AC-V3-011:** Given a typed Task checklist or Standard measurement embed, when its state changes, then
  the normalized domain row changes and the JSONB document retains only the reference.
- **AC-V3-012:** Given a first-time floor member, when asked to find and complete today's Café work,
  then they start unaided, complete the goal without entering configuration, and encounter no internal
  system nouns. The journey records steps, hesitation/misclicks, outcome, and duration.
- **AC-V3-013:** Given a manager triaging work, when filtering, grouping, switching presentations, and
  opening consecutive records, then the workflow remains keyboard-operable and retains collection
  context without repeated full-page navigation.
- **AC-V3-014:** Given every live route at the end of migration, when the route/component inventory is
  checked, then no route uses an unapproved bespoke page shell or superseded component/style family.

## 12. Delivery decomposition

The detailed implementation plan shall be split into independently reviewable issues:

1. Documentation truth reset, live route/component inventory, and `DESIGN.md` reconciliation: replace
   stale archetypes and deleted-route examples with the binding E7 visual foundation plus V3 page,
   record, collection, overlay, focus, navigation, and responsive grammar.
2. Storybook component/state/responsive matrix proving the reconciled `DESIGN.md` contract.
3. Page-family primitives and migration guards.
4. Shared overlay/panel/navigation host.
5. RecordViewer contract, field primitives, and Task adapter.
6. RecordCollection/view engine and Tasks/Signals adapters.
7. Inbox triage plus Deputy host integration.
8. Café canonical-record integration and Team-context correction.
9. Representative-slice rendered/driven owner gate; provisional IA ratification.
10. Structured-content schema ADR, storage/RLS, editor, and typed embeds.
11. Remaining route migration by page/component family.
12. Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough.

Each issue owns its spec delta, exact acceptance IDs, TDD tests, BDD journey where necessary, rendered
four-lens review, and backlog/status update. No issue may close only through audit prose.

## 13. Contradiction register

| Conflict | Resolution |
|---|---|
| E7 styling vs a completely new visual identity | E7 visual language retained (OD-72). |
| E7 snapshot vs later IA/IxD decisions | E7 visual only; current owner law owns behavior/structure. |
| New standalone mockups vs the quicksand lesson | Work directly in app; representative slice is the gate (OD-73). |
| Reuse vs preserving ugly/old implementations | Replace the canonical primitive once, migrate every consumer (OD-72/74). |
| Shared UI vs one universal database model | Separate domain models, shared RecordViewer grammar (OD-74). |
| Notion-like content vs operational/queryable state | JSONB authored content; normalized operational truth (OD-77). |
| Drawer-only vs page-only vs near-full popup | Wide panel from collections, same viewer on full page for direct/deep work (OD-78). |
| Different Feed/Table/Queue implementations | Shared RecordCollection engine with object-specific presentations (OD-79). |
| E7 run marked complete vs failed owner design acceptance | E7 is completed implementation history; V3 is the current acceptance era. |
| Current top-level IA | Provisional until representative journeys and owner review (OD-76). |

## 14. Owner gates

1. Approve this V3 design specification.
2. Approve the rendered/driven representative slice and ratify or amend the provisional IA.
3. Approve the structured-content schema ADR before migration touches domain storage.
4. Complete the final whole-app walkthrough before merge/deploy approval.
