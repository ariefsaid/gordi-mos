import { describe, it, expect } from 'vitest'
import { firstLine, remainingBody, signalTitle } from './signal-record-adapter'

// A Signal has no title: its identity is the first line of what was shared.
describe('Signal record identity (OD-REDESIGN-90 JTBD anatomy)', () => {
  it('AC-ANAT-002: the identity title is the body first line; a first line past the cap is cut at the cap with an ellipsis', () => {
    const shortLine = 'Oat milk ran out during the morning rush.'
    expect(signalTitle(shortLine)).toBe(shortLine)
    const longLine = 'Grinder 2 at HQ bar is throwing inconsistent doses — pulled it for a burr check before the morning rush. Grinder 2 at HQ bar is throwing inconsistent doses — pulled it for a burr check before the morning rush.'
    expect(longLine.length).toBeGreaterThan(160)
    const title = signalTitle(longLine)
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(161)
    expect(longLine.startsWith(title.slice(0, -1))).toBe(true)
    // firstLine takes ONLY the first line — a second line never leaks into the heading.
    expect(firstLine('Line one.\nLine two.')).toBe('Line one.')
    expect(signalTitle('Line one.\nLine two.')).toBe('Line one.')
  })

  it('the rest of the body appears once, below the heading', () => {
    expect(remainingBody('Line one.\nLine two.\nLine three.')).toBe('Line two.\nLine three.')
    expect(remainingBody('Only one line.')).toBe('')
  })
})
