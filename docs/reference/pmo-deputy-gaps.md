# PMO deputy — gap analysis (the floor to exceed)

> **What this is:** the PMO (sibling project) deputy/agent implementation audited as the **battery to
> port from** (ADR-0018), with its concrete gaps identified so the MOS redesign closes them toward a
> genuinely agent-native UX. PMO is the minimum; MOS aims higher. Sourced from the PMO codebase
> (`/Users/ariefsaid/Coding/PMO/pmo-portal/src/...` + `supabase/functions/agent-chat/`), read 2026-07-09.
>
> **Companion to:** `docs/reference/twenty-ixd-patterns.md` (the IxD target) · `docs/adr/0025` (the
> decisions that close these gaps) · `docs/adr/0018` (the port).

## What PMO built well (KEEP — port these)

| Strength | Evidence | Why MOS keeps it |
|---|---|---|
| **Deputy-safe authorization** | Caller-JWT, RLS as ceiling, no master key (ADR-0017 D1–D7) | Non-negotiable — the agent never exceeds the user's badge |
| **Grounded answers** | Curated tool catalog (`query_entity` read whitelist, write tools with confirm) | No fabrication — every claim traces to a tool result |
| **Persistent threads** | DB-backed `agent_threads`/`agent_runs`/`agent_events` (ADR-0043); resume on reopen | Conversation survives reload; history is navigable |
| **Keep-mounted panel** | Panel stays in DOM when closed (state survives) | No jarring re-init on open |
| **Docked + overlay toggle** | User chooses persistent-docked (reflows `<main>`) or transient-overlay, per-device | The panel form-factor is the user's call — both modes |
| **Write confirmation** | `create_activity`, `update_task_status`, `create_automation` all user-confirm | Consequential actions never fire silently |
| **Context-aware** | `AgentContextProvider` threads `{ route, entity?, selection? }` as read-only run context | The agent knows where you are |

## What PMO lacks (CLOSE — these are the floor, not the ceiling)

### Gap 1 — No inline agent reach (the defining gap)
PMO has **zero** inline `@`/slash-command agent invocation. Exhaustive grep of `pmo-portal/src` finds no
`mention`, `inlineai`, `askai`, or `slashCommand`. The only `openPanel` callers are the Rail button, ⌘J,
and the ⌘K *zero-results* fallback. **The agent is only reachable by navigating to it, never by invoking
it in context.** This is what makes it feel like "a chatbot bolted on" despite being context-aware.

### Gap 2 — The agent cannot navigate the user
PMO's agent *receives* route/entity context read-only (`FR-ATC-019: READ-ONLY — never writes location`)
but has **no navigate/deep-link tool** — grep finds no `navigate`/`open_route`/`goto` in `agent-chat/` or
`pmo-portal/src/lib/agent/`. An agent that says "here's the project that's behind" cannot also take you
there. The context is a one-way mirror.

### Gap 3 — Composed UI is trapped in the panel transcript
PMO's `compose_view` produces a `CompositionSpec` that renders **inside the panel transcript** via
`ArtifactSlot` — it does NOT drop into `<main>` or the user's workspace. "Promote a user view into the
app" is explicitly deferred to backlog (ADR-0040 addendum). Generative UI is a panel novelty, not an
in-flow artifact.

### Gap 4 — ⌘K and the deputy are separate surfaces
PMO's ⌘K (centered popup, nav+search+actions) and the deputy (right panel, conversation) are separate.
Their only bridge: an "Ask AI" row that appears *only when zero results match* and merely prefills the
composer. The agent is not a first-class ⌘K action — it's a last-resort fallback.

### Gap 5 — Write actions are generic, not in-context
PMO's write tools (`create_activity`, `update_task_status`) require the model to pass explicit
`contactId`/`taskId`. The agent *knows* the current entity (via context) but cannot say "advance *this*
task" — it must re-derive the ID. No tool consumes the live in-context entity/selection.

### Gap 6 — One global sidecar, not per-surface
PMO's panel is a single global drawer. The transcript is not scoped to the record you're on — you get
the same global conversation regardless of whether you're on a project detail page or the tasks list.
The agent doesn't feel woven into each work surface.

## The one-line verdict

PMO built an exemplary **deputy** (RLS-safe, grounded, persistent, docked/overlay) but only a
**side-panel UX**. The agent is context-*aware* but not context-*acting*: you navigate to it, it can't
navigate you, it can't drop UI into your workspace, and it can't be invoked inline. MOS's redesign closes
the *reach* and *act-in-context* gaps while keeping PMO's deputy-invariant and docked-panel strengths.

## What "better" looks like for MOS (the gaps closed + exceeded)

| PMO gap | MOS closes it by | Exceeds PMO how |
|---|---|---|
| No inline reach | `@` in any text surface → deputy with current record as seed | The agent is *in the work*, not beside it |
| Can't navigate user | `navigate(route, entity?)` deputy tool (user-confirmed if leaving current record) | "Take me there" — the agent moves you |
| Composed UI trapped in panel | `compose_view` → "insert/pin into workspace" disposition | Generative UI lands in `<main>`, not the transcript |
| ⌘K and deputy separate | Agent is a first-class, always-available ⌘K action | One universal entry: nav + search + agent |
| Writes are generic | Write actions bound to live in-context entity/selection | "Advance *this* task" — acts on what you're looking at |
| One global sidecar | Per-surface agent threads scoped to the record/view | The agent on a project page is *that project's* agent |

## Source links
- PMO repo: `/Users/ariefsaid/Coding/PMO/pmo-portal/src/components/panel/AssistantPanel.tsx`
- PMO command palette: `/Users/ariefsaid/Coding/PMO/pmo-portal/src/components/shell/CommandPalette.tsx`
- PMO agent tools: `/Users/ariefsaid/Coding/PMO/supabase/functions/agent-chat/actions.ts`
- PMO context provider: `/Users/ariefsaid/Coding/PMO/pmo-portal/src/components/panel/AgentContextProvider.tsx`
- PMO ADR-0040 (in-app panel Option A): `/Users/ariefsaid/Coding/PMO/docs/adr/0040-*.md`
