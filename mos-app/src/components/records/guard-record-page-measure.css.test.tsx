/**
 * MECH-GUARD — record-PAGE document measure parity (structural layer).
 *
 * Owner catch (census-sweep R2, DO-12 / SR-4): the "comfortable single-column reading measure"
 * for a record opened as its own page (the 820px column + the ~72ch prose-value cap) had been
 * written onto Task's OWN surface CSS (`.record-doc .record-field__value` in TaskSurface.css).
 * When the Signal record page shipped it reused the shared RecordViewer but NOT that per-surface
 * rule, so the Signal page inherited no measure — the exact one-surface drift the record grammar
 * exists to prevent. The fix moves the measure onto the SHARED `.record-viewer--page` seam so
 * BOTH kinds inherit ONE measure from one place.
 *
 * Owner rule (mandated): the measure fix lands at the shared record-document grammar, and this
 * guard pins the record-page measure grammar for BOTH record kinds so it can never re-fork onto
 * a single surface again.
 *
 * jsdom has no layout engine, so this layer pins the CSS grammar of the fix verbatim (the seam
 * carries the measure, and the per-surface fork stays gone) PLUS a rendered proof that BOTH a
 * Task-shaped and a Signal-shaped adapter route their page-mode field values through that one
 * shared class. The rendered-pixel proof (the two record pages sharing the same column width)
 * would live in the e2e geometry suite.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordViewer } from './record-viewer'
import type { RecordViewerAdapter } from './record-viewer.types'

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const viewerCss = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/records/record-viewer.css'), 'utf8'),
)
const taskSurfaceCss = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/tasks/TaskSurface.css'), 'utf8'),
)

/** Body of the first balanced `{…}` block whose selector matches `pattern`. */
function ruleBody(css: string, pattern: RegExp): string | null {
  const m = pattern.exec(css)
  if (!m) return null
  const open = css.indexOf('{', m.index)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return null
}

describe('GUARD record-page measure: ONE shared column + prose measure for BOTH record kinds', () => {
  it('GUARD: the shared .record-viewer--page seam carries the 820px document column, centered', () => {
    const body = ruleBody(viewerCss, /\.record-viewer--page\s*\{/)
    expect(body, 'record-viewer.css must define .record-viewer--page').not.toBeNull()
    expect(body!).toMatch(/max-width:\s*820px/)
    expect(body!).toMatch(/margin-inline:\s*auto/)
  })

  it('GUARD: the shared seam caps prose field values at the ~72ch reading measure', () => {
    const body = ruleBody(viewerCss, /\.record-viewer--page\s+\.record-field__value\s*\{/)
    expect(body, 'record-viewer.css must cap .record-viewer--page .record-field__value').not.toBeNull()
    expect(body!).toMatch(/max-width:\s*72ch/)
  })

  it('GUARD the guard: the measure must NOT be re-derived on a single surface (TaskSurface.css)', () => {
    // If someone re-adds `.record-doc .record-field__value { max-width: … }` (or any per-surface
    // field-value width) the Signal page silently loses parity again — the exact DO-12 regression.
    expect(taskSurfaceCss).not.toMatch(/\.record-field__value\s*\{[^}]*max-width/)
  })

  it('GUARD: BOTH a Task-shaped and a Signal-shaped adapter route page-mode values through the shared class', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    for (const adapter of [pageAdapter('task'), pageAdapter('signal')]) {
      const { container, unmount } = render(<RecordViewer adapter={adapter} mode="page" />, { wrapper })
      // The shared page-measure class is present…
      expect(container.querySelector('.record-viewer--page'), `${adapter.kind}: page seam present`).not.toBeNull()
      // …and the field value the measure caps actually renders inside it.
      expect(
        container.querySelector('.record-viewer--page .record-field__value'),
        `${adapter.kind}: field value inside the shared page seam`,
      ).not.toBeNull()
      unmount()
    }
  })
})

function pageAdapter(kind: 'task' | 'signal'): RecordViewerAdapter {
  return {
    kind,
    id: `${kind}-1`,
    title: kind === 'task' ? 'Restock oat milk' : 'Oat milk stockout',
    typeLabel: kind === 'task' ? 'Task' : 'Signal',
    metadata: [
      {
        id: 'facts',
        label: kind === 'task' ? 'Ownership' : 'Facts',
        fields: [
          {
            key: 'owningTeam', label: 'Owning Team', control: 'team',
            value: 't-1', displayValue: 'Gordi HQ Operations',
            editable: kind === 'task', readOnlyReason: kind === 'task' ? undefined : 'fixed after posting',
          },
        ],
      },
    ],
    relations: [],
    contentSlots: [],
    activity: [],
    actions: [],
    permission: { readOnly: false, allowedActionIds: [] },
    state: 'ready',
  }
}
