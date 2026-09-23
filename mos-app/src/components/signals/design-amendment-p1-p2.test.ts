import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AC-033 (doc-grep) — #770's DESIGN.md amendments ship VERBATIM (audit §6 P1/P2, PROPOSED
 * markers dropped on landing, DD-WAY-57 pattern). DESIGN.md is the design-system source of
 * truth, so the Signal row's no-controls anatomy and the Signals toolbar's two-row grammar
 * live there as owner-ratified prose, wrapped to the file's column — the grep asserts the
 * wording, unwrapped, not the line breaks.
 */
const DESIGN = readFileSync(resolve(process.cwd(), '..', 'DESIGN.md'), 'utf8')

/** § Components → Signal row (v4), from its heading to the next section heading. */
function signalRowSection(): string {
  const heading = DESIGN.indexOf('### Signal row (v4)')
  expect(heading, 'DESIGN.md has no § Signal row (v4) heading').toBeGreaterThanOrEqual(0)
  const next = DESIGN.indexOf('\n### ', heading + 1)
  return DESIGN.slice(heading, next).replace(/\s+/g, ' ')
}

/** § Components → DB-view toolbar controls (OD-P3-6), likewise. */
function toolbarSection(): string {
  const heading = DESIGN.indexOf('### DB-view toolbar controls (OD-P3-6)')
  expect(heading, 'DESIGN.md has no § DB-view toolbar controls heading').toBeGreaterThanOrEqual(0)
  const next = DESIGN.indexOf('\n### ', heading + 1)
  return DESIGN.slice(heading, next).replace(/\s+/g, ' ')
}

const P1 =
  'The row carries no controls: its whole surface opens the record, and `Create task`, ' +
  '`Add category`, `Acknowledge` live on the record alone. The meta line is plain text — ' +
  'author · Team · occurred (`dd Mon HH:MM`) · category when set — never bordered chips, and ' +
  'never a visibility sentence. Home and the archive render the same component; a difference ' +
  'between them is a defect.'

const P2 =
  'The Signals archive uses the two-row collection toolbar. Row 1: `All · Needs attention · ' +
  'Retracted · I posted` then user views, the `Table | Feed` segment at the right. Row 2: search ' +
  '· `Team ▾` · `Category ▾` (· `Group ▾` · `Sort ▾` when Table is live) · `Save view` as ghost ' +
  'text. No switch: a retracted Signal is reached through the `Retracted` view. Phone keeps the ' +
  'search field outside the single "View & filters" door; the door never carries the surface primary.'

describe('AC-033: DESIGN.md carries the #770 Signals amendments verbatim', () => {
  it('P1: § Signal row (v4) states the no-controls row anatomy after the never-capped rule', () => {
    const section = signalRowSection()
    expect(section).toContain(P1)
    const anchor = 'The `/work/signals` archive Feed **is** the collection and is never capped.'
    expect(section.indexOf(anchor)).toBeGreaterThan(-1)
    expect(section.indexOf(anchor)).toBeLessThan(section.indexOf('The row carries no controls:'))
  })

  it('P1: the landed text drops the PROPOSED marker', () => {
    expect(signalRowSection()).not.toContain('PROPOSED')
  })

  it('P2: § DB-view toolbar controls states the Signals two-row toolbar + phone door rule', () => {
    const section = toolbarSection()
    expect(section).toContain(P2)
    expect(section).not.toContain('PROPOSED')
  })
})
