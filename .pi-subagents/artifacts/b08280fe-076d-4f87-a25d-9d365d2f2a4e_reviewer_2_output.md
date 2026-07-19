## Review

**Scope:** Read-only audit; no files edited, created, deleted, servers started, or secrets read.

### Correct
- **Fact-vs-work boundary:** `SignalRecord` has no PIC/Supervisor/status/due/resolution (`signal-record.tsx:85-112`).
- **Capture-minimal fields:** composer starts with body, Team, occurrence time, and implicit author (`signal-composer.tsx:132-199`).
- **Mention semantics:** Person/Team/BU groups are implemented; Site is correctly a derived pill, not `@Site` (`signal-mention-picker.tsx`, `signal-composer.tsx:72-81`).
- **Task reuse and canonical task handling:** one `TaskSurface` supports panel/page modes (`tasks-layout.tsx:56-69`).
- **Work routes and mobile task disclosure:** canonical child routes and one mobile “View options” control exist.

### Blocker — IA / IxD
1. **Signals violate OD-63 direct-open semantics — CONFIRMED, high confidence.**  
   The only Signal route is `/work/signals`; `?record=` always mounts `SignalRecordHost` with `mode="panel"` (`router.tsx:112`, `signals-archive-page.tsx:163-170`, `signal-record-host.tsx:179-181`). Direct URL, refresh, and new tab therefore show the list plus drawer instead of a standalone canonical Signal page. Existing tests explicitly encode this incorrect behavior (`signals-archive-page.test.tsx`, C3 tests). This fails Experience Contract Rule 4.

2. **No shared drawer host — CONFIRMED, high confidence.**  
   Signal archive, task routes, and the global composer each mount independent `<aside>` hosts (`signals-archive-page.tsx:165-170`, `task-drawer.tsx`, `signal-composer-host.tsx`). Opening Share Signal while a Signal/task drawer is open can produce competing drawers, contrary to Rule 6 and Rule 11.

### Major — Product / JTBD
3. **Signal attention cannot be raised after capture — CONFIRMED, high confidence.**  
   The composer has no attention state/control and sends only body, Team, occurrence time, and mentions (`signal-composer.tsx:50-54`, `113-120`). Cards/records only display attention (`signal-card.tsx:49-50`; `signal-record.tsx:93-95`). The convergence reference explicitly provides an FYI-to-attention interaction. Staff cannot promote a factual Signal to “Needs attention” or “Urgent.”

4. **Photo/evidence attachment control was lost — CONFIRMED, high confidence.**  
   The approved convergence composer includes “Attach photo or evidence” (`convergence-flows/flows.js:458-459`). The app composer has no attachment button/input (`signal-composer.tsx:132-199`). This loses an explicitly approved Signal capture affordance.

5. **Signal visibility preview is missing from Home feed cards — CONFIRMED, high confidence.**  
   The reference screenshots show “Visible to Gordi HQ Operations.” `SignalFeedSection` never computes/passes `shieldLine` (`signal-feed-section.tsx:56-65`), and `SignalFeed` passes no `shieldLine` to `SignalCard` (`signal-feed.tsx:40-49`). This weakens J12’s audience/trust requirement.

6. **Tasks default to “All,” not member-first work — CONFIRMED, high confidence.**  
   `useTasksSavedView` returns `all` when no query is present (`use-tasks-saved-view.ts:23-44`), and `TasksLayout` passes that state directly (`tasks-layout.tsx:24-30`, `74-84`). This conflicts with the approved D9 expectation that a new Work user starts at My Tasks and makes the least-technical front less obvious.

### Major — IxD / Responsive
7. **Signal archive mobile front-loads configuration — CONFIRMED, high confidence.**  
   Search and “Show retracted” controls render before the Signal list with no single mobile disclosure (`signals-archive-page.tsx:105-125`, `134-161`). Rule 8 requires work first and configuration behind one control on phone.

8. **URL state is incomplete for Tasks — CONFIRMED, high confidence.**  
   Only `?view=` is URL-synced. Grouping is persisted in localStorage (`use-tasks-view-pref.ts:38-45`, `97-112`); BU/status/person/search/sort/layout are component state (`tasks-workspace.tsx:145-159`). Refresh/new-tab cannot preserve the full view state required by Rule 4.

### Major — Visual / IA
9. **Phone loses current-location context and scope identity — CONFIRMED, high confidence.**  
   Breadcrumb is hidden below 920px (`top-bar.tsx:234-243`), while `ContextRow` renders only a role-derived scope and job sentence (`context-row.tsx:24-47`). The approved phone reference shows current location, person identity, and site context. The existing test intentionally asserts the viewer name is absent (`context-row.test.tsx`), confirming this is a deliberate regression.

10. **Verb+object grammar still fails for Task creation — CONFIRMED, high confidence.**  
    Visible actions use `+ New task` (`messages.ts:125`, `tasks-workspace.tsx:718-721`) and `Add task` (`group-header-row.tsx:165-171`), while Rule 7 requires “Create Task” and forbids bare New/Add grammar.

### Note — Product / IA
- **Home Signal placement can regress when personal-first is selected — INFERENCE, medium confidence.**  
  The personal canvas contains the Signal feed (`home-page.tsx:162-222`), and personal-first emits that region before attention (`home-page.tsx:283-287`). This can put the ambient feed above the non-removable attention brief, contrary to OD-59’s “below the brief” wording.

### Explicit override check
- **Pass:** Work has canonical child routes rather than one `/work` URL.
- **Pass:** Tasks reuses the shipped `TasksWorkspace`/`TaskSurface`.
- **Pass:** centered command palette is implemented.
- **Pass:** unauthorized Money/Admin entries are hidden through destination gating.
- **Fail:** Signal direct-open/full-page override.
- **Fail:** generic New/Add action grammar.
- **Fail:** approved Signal composer enrichment affordances (attachment and attention escalation).

### Validation
- Focused tests: **49 passed** across rail, Signal archive, and AppShell suites.
- Typecheck: **passed**.
- `git diff --check`: **passed**.
- No staged files; no fixes applied.