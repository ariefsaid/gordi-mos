// Home composition — the persona-composed plan for Home (#759, AC-080).
//
// Home is composed per persona from the ONE region model (home-regions.ts). This is the pure
// decision the page delegates to: given viewer facts, which regions/doors/feed variant does this
// Home carry, and in what shape?
//
// Two shapes today (OD-WAY-93 (3)):
//   - member  — capture-first: [cafe-door?, needs-you, signals-no-search]. No tabs, no Objectives
//               door, no failed-checks. `needs-you` is the barista's assigned steps and tasks.
//   - lead+   — cockpit: [tabs(needs-you, my-work, failed-checks?), objectives-door, signals]. A
//               failed-checks tab exists only where #757 admits the viewer (Café-affiliated / admin);
//               everyone else in this arm sees two tabs.
//
// A viewer is a MEMBER iff they have neither reports nor a `objective.manage` / `workline.manage`
// grant. `isManager` is the derived-manager fact from the role chain (CONTEXT.md → Manager); the
// two manage capabilities are the client mirror of the same grants that gate the Objectives /
// Work-line surfaces (lib/capabilities.ts).
//
// This is intentionally a small pure module: no React, no i18n, no DAL. `home-page.tsx` reads
// viewer + affiliation facts and calls it; the arrangements + aside render the plan it returns.

export type HomeCompositionKind = 'member' | 'lead'

export interface HomeComposition {
  kind: HomeCompositionKind
  /** Member composition leads with the viewer's Module capture door (today: Café). Absent when the
   *  viewer is not affiliated with a check-producing Module. */
  cafeDoor: boolean
  /** The failed-checks region belongs to the cockpit tabs (lead+) AND only where the check-producing
   *  Module admits the viewer. Members never carry it (a member has no reports to review). */
  failedChecksAdmitted: boolean
  /** The Objectives roll-up door in the standing aside. Cockpit only — a member came to Home for
   *  what needs them today, and a company-wide roll-up is noise on that job (AC-204 (4)). */
  objectivesDoor: boolean
  /** The Signals feed's search input hides for a member (D-D2): a member's Signals column carries
   *  the `Share a Signal` door only, so the shape does not compete with the capture-first bands
   *  above it. A lead's cockpit keeps the search — Signals is one of three peers there. */
  signalsSearch: boolean
}

export interface HomeCompositionInput {
  /** Has direct reports (derived-manager from the role chain — CONTEXT.md → Manager). */
  isManager: boolean
  /** Client mirror of `shared.can('objective.manage')` — one of the two "manage capability" grants. */
  canManageObjectives: boolean
  /** Client mirror of `shared.can('workline.manage')` — the second of the two. */
  canManageWorkLines: boolean
  /** The viewer holds a capture affiliation for the Café Module (owning-Team membership OR
   *  admin/ops_lead — the same predicate lib/cafe-affiliation.ts already answers app-wide). */
  canCaptureCafe: boolean
  /** The /cafe/log ROUTE admits the viewer (OD-WAY-51, the same authority the rail uses). */
  seesCafeChecks: boolean
}

/** The composition rule (AC-080). Pure over its inputs — no globals, no I/O. */
export function composeHome(input: HomeCompositionInput): HomeComposition {
  const isMember = !input.isManager && !input.canManageObjectives && !input.canManageWorkLines
  if (isMember) {
    return {
      kind: 'member',
      cafeDoor: input.canCaptureCafe,
      failedChecksAdmitted: false,
      objectivesDoor: false,
      signalsSearch: false,
    }
  }
  return {
    kind: 'lead',
    cafeDoor: false,
    failedChecksAdmitted: input.seesCafeChecks,
    objectivesDoor: true,
    signalsSearch: true,
  }
}
