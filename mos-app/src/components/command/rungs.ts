// The palette's row contract and the child-rung resolver (issue 479). Pure logic in a
// non-component module so the resolver can be exported and pinned directly by unit test —
// a .tsx file exporting a function alongside a component breaks react-refresh.

import type { ComponentType } from 'react'

// A flat, activatable item. `kind` discriminates actions, in-place disclosures, navigation,
// and records (Task rows push Recent before navigating canonical). `run` lets non-navigation
// actions dispatch through the shared activate() seam (D-PLN-7).
export type CommandItem = {
  id: string
  label: string
  /** SVG icon from the app icon system (parity A1 — the palette is one monochrome set, never emoji) */
  Icon: ComponentType
  kind: 'action' | 'navigate' | 'record' | 'disclosure'
  to?: string
  run?: () => void
  /** Keep the palette open after this in-place command (e.g. a result-group disclosure). */
  keepOpen?: boolean
  meta?: string
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
  /** The row this child hangs under. Defaults to the Work row, the first destination with children. */
  parentId?: string
  /**
   * The row is INERT: rendered so the result set stays honest, but not activatable and skipped by
   * the roving index — it announces aria-disabled="true" instead of taking a dead press. The one
   * instance is a person hit (RECORD_KIND_CONFIG in command-menu.tsx): shared.people has no
   * record route, and the palette's only /profile route is the VIEWER'S OWN.
   */
  disabled?: boolean
}

/** The Work PARENT row — the row a child hangs its rung from unless its `parentId` names another. */
export const WORK_PARENT_ID = 'n-work'

/**
 * The rung states a RELATIONSHIP, so it may only be drawn while both ends are on screen.
 *
 * `child: true` says "the registry declares this row under a destination". The rung says something
 * else: "my parent row is rendered above me". The palette emits each destination's children
 * ADJACENT to it (directly beneath, before the next root), at rest and typed, so the run is
 * unbroken by construction. DESIGN.md's Rail Type Ladder is "per-level, not per-surface" — a
 * child wears the Child rung wherever it is listed.
 *
 * So resolve the claim against what actually renders, at the last seam before render (after the
 * query filter AND after the ship gate, either of which can remove the parent): a child keeps its
 * rung only while an unbroken run of children reaches back to its parent row above it. The
 * run matters as much as the parent — the guide is one continuous line, and a non-child row
 * dropped into the middle of it (the pre-delta typed view parked roots like Inbox or Personal
 * Profile between Work and its children) ends the tree the indent is describing.
 *
 * Deleting the rung instead is not available: two adjacent rows to the SAME target, at one weight
 * and one indent, is the regression issue 479 closed.
 *
 * Exported for the issue-479 unit pin: the separated-parent shape is unrenderable through the
 * palette (children emit adjacent to their parent row), so the contract is tested here directly.
 */
export function withResolvedRungs(items: CommandItem[]): CommandItem[] {
  let lastRoot: string | undefined
  return items.map((item) => {
    if (!item.child) {
      lastRoot = item.id
      return item
    }
    if (lastRoot === (item.parentId ?? WORK_PARENT_ID)) return item
    return { ...item, child: false }
  })
}
