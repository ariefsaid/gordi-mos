// DQBadge tests — the data-quality badge from BOM coverage (FR-024/AC-024, design-plan §2.10).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DQBadge } from './dq-badge'

describe('DQBadge', () => {
  it('good: success tone + "good" label', () => {
    const { container } = render(<DQBadge dq="good" />)
    expect(screen.getByText(/good/i)).toBeInTheDocument()
    expect(container.querySelector('.dq-badge--good')).not.toBeNull()
  })

  it('partial: warning tone + "partial" label', () => {
    const { container } = render(<DQBadge dq="partial" />)
    expect(screen.getByText(/partial/i)).toBeInTheDocument()
    expect(container.querySelector('.dq-badge--partial')).not.toBeNull()
  })

  it('unknown: neutral tone + "unknown" label', () => {
    const { container } = render(<DQBadge dq="unknown" />)
    expect(screen.getByText(/unknown/i)).toBeInTheDocument()
    expect(container.querySelector('.dq-badge--unknown')).not.toBeNull()
  })

  it('AA pin (#359): the good badge uses the on-tint text token, never the inverted fill text', () => {
    // Source-scan (vocab-guard pattern): --success-foreground is the near-white text for a
    // SOLID success fill; on the 14% tint it fails AA. The on-tint token (--status-won-text,
    // what Pill uses for this exact pale-chip case) is the correct family.
    const css = readFileSync(resolve(__dirname, 'dq-badge.css'), 'utf8')
    const goodBlock = css.split('.dq-badge--good {')[1]?.split('}')[0] ?? ''
    expect(goodBlock).toContain('color: var(--status-won-text)')
    expect(goodBlock).not.toContain('var(--success-foreground)')
  })

  it('always carries a leading dot (status semantics, unlike BasisChip)', () => {
    const { container } = render(<DQBadge dq="partial" />)
    expect(container.querySelector('.dq-badge .dot')).not.toBeNull()
  })

  it('renders "BOM coverage" as the accessible qualifier for each variant', () => {
    const { rerender } = render(<DQBadge dq="good" />)
    expect(screen.getByText(/good/i)).toBeInTheDocument()
    rerender(<DQBadge dq="partial" />)
    expect(screen.getByText(/partial/i)).toBeInTheDocument()
    rerender(<DQBadge dq="unknown" />)
    expect(screen.getByText(/unknown/i)).toBeInTheDocument()
  })
})
