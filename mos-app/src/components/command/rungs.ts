// The palette's row contract and the child-rung resolver (issue 479). Pure logic in a
// non-component module so the resolver can be exported and pinned directly by unit test —
// a .tsx file exporting a function alongside a component breaks react-refresh.

import type { ComponentType } from 'react'

// A flat, activatable item. `kind` discriminates: 'action' (runs a callback),
// 'navigate' (goes to `to`), 'record' (a Task row → pushRecent + navigate canonical).
// `run` extends the existing activate() so universal actions (Ask Deputy / Share
// Signal) that are not pure navigations can dispatch (D-PLN-7). `gated` hides an
// item (Money navigate) when the viewer is unauthorized.
export type CommandItem = {
  id: string
  label: string
  /** SVG icon from the app icon system (parity A1 — the palette is one monochrome set, never emoji) */
  Icon: ComponentType
  kind: 'action' | 'navigate' | 'record'
  to?: string
  run?: () => void
  meta?: string
  gated?: boolean
  record?: { id: string; title: string }
  /**
   * This row is one of Work's DECLARED children — a fact about the registry, true whatever the
   * query is. It is not yet a licence to draw the rung: `withResolvedRungs` decides that against
   * what actually renders, and clears the flag on a child whose parent row was filtered away.
   *
   * Where it survives, it is rendered as `data-child`, the palette's counterpart of the
   * rail/drawer's `rail-item--child` rung class: every nav surface has to say which of its rows
   * are children, or a guard comparing their sequences reads the Work PARENT row (`/work/tasks`,
   * same target as the Tasks child) as a child too and the lists stop being comparable (issue 479).
   */
  child?: boolean
  /**
   * The row is INERT: rendered so the result set stays honest, but not activatable and skipped by
   * the roving index — it announces aria-disabled="true" instead of taking a dead press. The one
   * instance is a person hit (RECORD_KIND_CONFIG in command-menu.tsx): shared.people has no
   * record route, and the palette's only /profile route is the VIEWER'S OWN.
   */
  disabled?: boolean
}

/** The Work PARENT row — the one row a Work child may hang its rung from. */
export const WORK_PARENT_ID = 'n-work'

/**
 * The rung states a RELATIONSHIP, so it may only be drawn while both ends are on screen.
 *
 * `child: true` says "the registry declares this row under Work". The rung says something else:
 * "my parent row is rendered above me". Since #738 the palette rests on destination ROOTS, so
 * children render only in the typed view — where `searchableNavigateItems` emits them ADJACENT to
 * the Work row (directly beneath it, before the surviving roots) so the run is unbroken by
 * construction. The rung therefore survives the typed view: DESIGN.md's Rail Type Ladder is
 * "per-level, not per-surface" — a child wears the Child rung wherever it is listed.
 *
 * So resolve the claim against what actually renders, at the last seam before render (after the
 * query filter AND after the ship gate, either of which can remove the parent): a child keeps its
 * rung only while an unbroken run of children reaches back to the Work parent row above it. The
 * run matters as much as the parent — the guide is one continuous line, and a non-child row
 * dropped into the middle of it (the pre-delta typed view parked roots like Inbox or Personal
 * Profile between Work and its children) ends the tree the indent is describing.
 *
 * Deleting the rung instead is not available: two adjacent rows to the SAME target, at one weight
 * and one indent, is the regression issue 479 closed.
 *
 * Exported for the issue-479 unit pin: the separated-parent shape is unrenderable through the
 * palette (children emit adjacent to the Work row), so the contract is tested here directly.
 */
export function withResolvedRungs(items: CommandItem[]): CommandItem[] {
  let underWork = false
  return items.map((item) => {
    if (!item.child) {
      underWork = item.id === WORK_PARENT_ID
      return item
    }
    if (underWork) return item
    return { ...item, child: false }
  })
}
