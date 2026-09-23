/**
 * MECH-GUARD — every formatted value in the provenance note carries the nowrap span (#277).
 *
 * freshness-label.css.test.ts pins the CSS half: the label wraps, `.freshness-label-ts` does not.
 * That guard stays green if the MARKUP stops using the span — which is exactly how the no-snapshot
 * branch shipped its sync time unwrapped, free to break between "03:30" and "WIB". This pins the
 * other half: on every branch that renders a formatted value, the value is inside the span.
 *
 * The live branch is the contrast case — it renders caller prose with no value, so it must NOT
 * carry the span. Asserting that keeps the distinction meaningful rather than "wrap everything".
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DataProvenanceNote } from './data-provenance-note'

describe('GUARD #277: formatted values in the provenance note never split across lines', () => {
  it('GUARD: the "as of" timestamp is inside .freshness-label-ts', () => {
    const { container } = render(
      <DataProvenanceNote kind="snapshot" hasData asOf="2026-07-02T08:30:00Z" />,
    )
    const ts = container.querySelector('.freshness-label-ts')
    expect(ts, 'the snapshot timestamp must carry the nowrap span').not.toBeNull()
    expect(ts!.textContent?.trim()).not.toBe('')
  })

  it('GUARD: the no-snapshot sync time is inside .freshness-label-ts', () => {
    const { container } = render(
      <DataProvenanceNote kind="snapshot" hasData={false} nextSyncLabel="03:30 WIB" />,
    )
    const ts = container.querySelector('.freshness-label-ts')
    expect(ts, 'the sync time must carry the nowrap span — it is a value, not prose').not.toBeNull()
    expect(ts!.textContent).toContain('03:30 WIB')
  })

  it('GUARD: the default sync time is wrapped too — the fallback is still a value', () => {
    const { container } = render(<DataProvenanceNote kind="snapshot" hasData={false} />)
    expect(container.querySelector('.freshness-label-ts')?.textContent).toContain('03:30')
  })

  it('the live note is caller prose, so it carries no value span', () => {
    const { container } = render(
      <DataProvenanceNote kind="live" show note="ERP inventory not connected yet" />,
    )
    expect(container.querySelector('.freshness-label')).not.toBeNull()
    expect(
      container.querySelector('.freshness-label-ts'),
      'prose has no value to keep unbroken — wrapping it would defeat the wrap',
    ).toBeNull()
  })
})
