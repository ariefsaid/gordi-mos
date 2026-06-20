// PR-6 AC-D03 (RI-3, ADR-0013 Decision 2) — cross-surface no-bleed lock.
// Every identity-bearing single-line string in the revamp must ellipsize (`truncate`)
// AND carry a `title` so the full value is recoverable on hover when clipped. Several
// surfaces already assert this per-surface (breadcrumb AC-S03, user chip AC-D03, table
// name AC-T03, ⌘K AC-W06/result rows, My-Week AC-W06). This file is a durable cross-surface
// SOURCE guard so a future edit that drops a `title`/`truncate` on any identity string fails
// here, not only in a manual dark-mode pass.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

/** Assert a source contains a JSX element that carries BOTH `truncate` and a `title`
 *  attribute on (or near) the identity marker substring. We check the marker line region. */
function hasTruncateAndTitle(source: string, marker: string): boolean {
  const idx = source.indexOf(marker)
  if (idx < 0) return false
  // Inspect a window around the marker (the element's open tag + attributes).
  const window = source.slice(Math.max(0, idx - 400), idx + 200)
  return /truncate/.test(window) && /title[=:]/.test(window)
}

describe('AC-D03: identity-bearing strings ellipsize + carry title (no-bleed, cross-surface)', () => {
  it('AC-D03: top-bar brand wordmark — truncate + title', () => {
    const s = src('src/shell/top-bar.tsx')
    expect(hasTruncateAndTitle(s, 'Gordi MOS')).toBe(true)
  })

  it('AC-D03: breadcrumb current crumb — truncate + title', () => {
    const s = src('src/shell/breadcrumb.tsx')
    // both the leaf and section current-crumb spans truncate + title (AC-S03)
    expect(/className="truncate[^"]*"\s*\n?\s*title=/.test(s)).toBe(true)
  })

  it('AC-D03: user chip name — truncate + title', () => {
    const s = src('src/shell/user-chip.tsx')
    // the name <div> carries truncate and a title bound to the full name
    expect(/className="truncate[^"]*"[\s\S]{0,120}title=\{viewer\.person\.full_name\}/.test(s)).toBe(true)
  })

  it('AC-D03: table task-name link — truncate(name-chip) + title', () => {
    const s = src('src/components/tasks/task-row.tsx')
    // name cell anchor carries name-chip (truncating chip) + title={task.title}
    expect(/name-chip[\s\S]{0,80}title=\{task\.title\}/.test(s)).toBe(true)
  })

  it('AC-D03: ⌘K result row label — truncate + title', () => {
    const s = src('src/components/command/command-menu.tsx')
    expect(/cm-item-label truncate"[\s\S]{0,40}title=/.test(s)).toBe(true)
  })

  it('AC-D03: My-Week task name chip — truncate + title', () => {
    const s = src('src/components/weekly/my-tasks-card.tsx')
    expect(/mini-name-chip truncate"[\s\S]{0,80}title=\{task\.title\}/.test(s)).toBe(true)
  })
})
