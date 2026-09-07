import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AC-024 (doc-grep) — ticket #806 ships two DESIGN.md amendments VERBATIM.
 * DESIGN.md is the design-system source of truth, so the two owner-ratified passages
 * live there as prose — this test asserts the wording (line-wrap ignored) rather than
 * the file layout, mirroring `design-amendment-a9.test.ts`.
 *
 * W1 replaces § V3 page families' Management bullet route-examples sentence with the
 * amended paragraph naming the definition catalogs as collection-with-records and
 * relocating Rename to the title / Archive to the overflow.
 *
 * W5 appends the A-and-R-only chip-set paragraph to § Governance role chips, stating
 * Steps-tab PIC binding and the once-per-tab Supervisor inheritance line.
 */
const DESIGN = readFileSync(resolve(process.cwd(), '..', 'DESIGN.md'), 'utf8')

const W1_AMENDMENT =
  '**Management** is people, definitions, catalogs, profile, and administration. ' +
  'A definition catalog (Projects & Processes, Objectives) is a **collection with records**: ' +
  'its rows open a typed record in the shared RecordViewer (panel at ≥1370, page below and on direct URL — the Tasks regime), ' +
  'and its rows carry no inline management actions. Rename is the record\'s title edit; ' +
  'Archive lives in the record\'s overflow. Current route examples include ' +
  '`/work/projects`, `/work/projects/:id`, `/work/objectives`, `/work/objectives/:id`, ' +
  '`/admin/people`, and `/profile`.'

const W5_AMENDMENT =
  'The chip set on a record is A and R only (Consulted / Informed are not fields on the MVP schema). ' +
  "A Process's Steps tab shows each generated-Task definition's PIC **binding** " +
  '(`role Cafe Ops Lead` or a named person) and states Supervisor inheritance once for the tab ' +
  '(`inherited from <Process A>`), never per step unless overridden (OD-REDESIGN-14).'

function unwrap(section: string): string {
  return section.replace(/\s+/g, ' ').trim()
}

describe('AC-024 (#806): DESIGN.md carries the W1 + W5 amendments verbatim', () => {
  it('§ V3 page families → Management bullet is amended (W1) — the definition catalogs are collections-with-records at /work/projects/:id, /work/objectives/:id', () => {
    const heading = DESIGN.indexOf('### V3 page families')
    expect(heading, 'DESIGN.md has no § V3 page families heading').toBeGreaterThanOrEqual(0)
    const management = DESIGN.indexOf('- **Management**', heading)
    expect(management, 'V3 page families no longer carries a Management bullet').toBeGreaterThanOrEqual(0)
    // The Management bullet ends at the paragraph's next blank line.
    const end = DESIGN.indexOf('\n\n', management)
    const block = unwrap(DESIGN.slice(management, end))
    expect(block).toContain(unwrap(W1_AMENDMENT))
  })

  it('§ Governance role chips → the A-and-R-only paragraph is appended (W5) — the Steps-tab PIC binding + once-per-tab Supervisor inheritance', () => {
    const heading = DESIGN.indexOf('### Governance role chips')
    expect(heading, 'DESIGN.md has no § Governance role chips heading').toBeGreaterThanOrEqual(0)
    // The section runs from its own heading to the next section heading. The W5
    // paragraph must sit inside that span (not swap the section around it).
    const nextHeading = DESIGN.indexOf('\n### ', heading + 1)
    const section = unwrap(DESIGN.slice(heading, nextHeading === -1 ? undefined : nextHeading))
    expect(section).toContain(unwrap(W5_AMENDMENT))
  })
})
