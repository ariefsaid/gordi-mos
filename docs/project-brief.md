# Gordi MOS Project Brief

## Status

Draft brief captured from the 2026-06-10 planning discussion. This is not an implementation plan yet.

## Product

Gordi MOS is a separate application for Gordi's Management Operating System. It replaces the dormant Notion Management OS workflow with a fast, usable internal management surface, while still aspiring toward the longer-term operating system:

Strategy -> Objective -> Outcome -> Program/Process -> Output -> Task.

The first release should optimize for daily and weekly workflow usability, not visual fidelity to Notion and not the full long-term OS.

## First Users

Initial users are Gordi managers and a few selected operational people, not only Arief and not the whole company at launch.

Expected early user groups:

- Arief
- Gordi managers/leads
- Selected ops users who need to submit or review daily updates

## URL

Recommended production path:

- `https://ops.gordi.id/mos`

Rationale: short, memorable, and consistent with existing `ops.gordi.id/kitchen` and future sibling apps such as `/roastery`.

## Scope

### First Slice

The first usable slice should cover:

- Task ownership
- Lightweight RACI on tasks
- Weekly updates
- Daily ops updates rolled in from kitchen and future roastery workflows

### Later MOS Scope

MOS eventually becomes the full management package:

- Objectives and outcomes
- Programs and processes
- Standard Work Packages
- Role and job-description clarity
- RACI across recurring work
- Weekly management rhythm
- Daily operational activity visibility
- Integration visibility for kitchen, roastery, and ESB write-back flows

## Non-Goals For First Slice

- Do not clone the old Notion visual layout.
- Do not build the full RACI matrix UI first.
- Do not build the full OKR / Strategy-to-Execution cascade first.
- Do not migrate or rewrite the live kitchen app first.
- Do not embed this inside the PMO codebase.

## Codebase Direction

Create Gordi MOS as a separate project under `~/Coding/gordi-mos`.

PMO remains a reference architecture, not the container.

Reuse from PMO where practical:

- Visual language from `DESIGN.md`
- Component patterns
- Supabase / RLS / data-access conventions
- Spec -> plan -> build -> review workflow
- Testing and acceptance discipline

Keep DRY, but avoid premature shared-package work. Start by copying or referencing stable design decisions. Extract a shared UI package only after both PMO and MOS have active, repeated use of the same components.

## Backend Direction

Use one self-hosted Supabase stack/project for MOS and future Gordi ops apps.

Self-hosted Supabase is treated as one project. Separate apps and domains inside Postgres with schemas, RLS, `org_id`, and app/workspace fields rather than separate Supabase projects.

Recommended schemas:

- `shared`: people, roles, business units, shared profile helpers
- `mos`: tasks, lightweight RACI, weekly updates, programs/processes later
- `ops`: daily ops events from kitchen, roastery, and future ops apps
- `integrations`: ESB write-back logs, idempotency keys, external references, pipeline state

## Auth Direction

Use Supabase Auth as the shared identity layer for MOS and future ops apps.

Cloudflare Access should not be the long-term MOS auth model because the free tier is limited to 50 users. CF Access can remain where already useful, but MOS should assume Supabase login.

## Kitchen App Direction

Keep the current kitchen app running. Do not migrate or rewrite it first.

Near-term integration:

- Mirror approved kitchen activity into Supabase/MOS as daily ops updates.
- Surface kitchen activity inside MOS for management visibility.

Later:

- MOS can become the review/approval cockpit if that becomes useful.
- A kitchen backend migration to Supabase should happen only after MOS first-slice workflows are stable and the benefit is clear.

## Roastery App Direction

Build the future roastery app Supabase-native from day one.

It should:

- Use the same Supabase Auth/profile model as MOS
- Reuse shared people/roles/business-unit tables
- Write daily operational events into `ops`
- Expose ESB pipeline status through `integrations`

## Lightweight RACI v1

RACI starts as fields on tasks/work items, not a matrix UI.

Initial fields:

- `responsible_person_id`
- `accountable_person_id`
- `consulted_person_ids`
- `informed_person_ids`

The first UI should make these visible and filterable on task lists and task detail. A full matrix can come later after actual usage shows the needed shape.

## Reference Sources

Future agents should read these vault pages before making product or architecture decisions:

- [Notion Management OS](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Notion%20Management%20OS.md) — old Notion schema reference; captures the dormant Management OS constellation and the live Tasks/Projects/Sprints trio. Important caveat: schema is captured, but row contents, views, filters, and visual layout are not.
- [Management OS Framework](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Management%20OS%20Framework.md) — original Gordi hierarchy: Strategy -> Objective -> Outcome -> Project -> Milestone -> Task, plus RACI and job descriptions.
- [Strategy-to-Execution Stack](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Strategy-to-Execution%20Stack.md) — refined MOS framing: Strategy -> Objective -> Outcome -> Program/Process -> Output -> Task; adds Run/Optimize/Transform lanes, SWP semantics, and A/R ownership.
- [Gordi](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Gordi.md) — business context, management team, current priorities, and why MOS matters operationally.
- [Gordi MOC](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Gordi%20MOC.md) — navigation map for Gordi-related wiki context.
- [Teable](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Teable.md) — current role of Teable, self-hosted deployment, and why it should be treated as a table/admin surface rather than the core backend for new custom apps.
- [Teable API Surface](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Teable%20API%20Surface.md) — API details and gotchas, especially the singleSelect PATCH `typecast=true` silent-failure issue.
- [ris-dev Infrastructure](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/ris-dev%20Infrastructure.md) — Hetzner host facts, current `ops.gordi.id` stack, Caddy/compose conventions, and backup/open-follow-up risks.
- [Ops Gordi Mini-Apps Umbrella](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Ops%20Gordi%20Mini-Apps%20Umbrella.md) — path-based `ops.gordi.id` app strategy, shared role taxonomy, deferred refactors, and accepted risks.
- [Kitchen App for Gordi](/Users/ariefsaid/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/vault/wiki/Kitchen%20App%20for%20Gordi.md) — live kitchen app architecture, current Teable-backed workflow, ESB write-back status, and migration cautions.
- [PMO Portal project instructions](/Users/ariefsaid/Coding/PMO/AGENTS.md) — reference for the workflow and quality bar to reuse, not the container for this app.
- [PMO Director playbook](/Users/ariefsaid/Coding/PMO/docs/director-playbook.md) — reference for issue-by-issue orchestration, review, acceptance, and verification.
- [PMO UI/UX Workflow](/Users/ariefsaid/Coding/PMO/docs/design-workflow.md) — reference for design-system reuse, visual review, IxD review, and IA review.

## Assumptions

- Workflow usability matters more than matching Notion's visual layout.
- Speed matters more than model completeness for the first slice.
- Gordi work includes both project-shaped work and BAU/process work, so forcing everything into "Project" is wrong.
- A separate MOS repo reduces confusion compared with embedding the feature inside PMO.
- PMO's architecture and workflow are still valuable as a reference.
- One self-hosted Supabase project is enough for the initial MOS, roastery, and ops-app backend.
- Kitchen should stay stable while MOS is introduced.
- Roastery is the better first Supabase-native ops app.
- Managers plus selected ops users are the first rollout audience.

## Open Clarifications

- Exact first navigation IA for `/mos`.
- Whether to name the app publicly as `Gordi MOS`, `Management OS`, or another user-facing label.
- Which current kitchen events should be mirrored into MOS first.
- Whether daily ops updates should be generic from day one or kitchen/roastery-specific first.
- Whether PMO's `DESIGN.md` should be copied into this repo or referenced until the first UI build.
