/**
 * GUARD — the Signal row must fit the SPACE IT HAS, not the window it happens to be in.
 *
 * Rendered defect (1440px Home, measured): the Home ambient tail is a ~300px column, but the row's
 * stack rule was a VIEWPORT `@media (max-width: 480px)`, so at 1440 the row stayed horizontal — the
 * fixed 184px tail (attention pill + category control) left the title 96px, which wrapped to 2 lines
 * AND still ellipsised ("Grinder 2 at HQ bar is…"), while the meta subline collapsed to 5 lines with
 * the bare "·" separators stranded alone on their own lines. The archive Feed (1142px) was fine —
 * proof the trigger must be the CONTAINER, not the viewport.
 *
 * Two guards, at the two layers that can actually catch it:
 *  (a) CSS grammar — jsdom has no layout engine, so the authored query TYPE is the expressible
 *      structural invariant: the feed establishes an inline-size container and the stack rule lives
 *      in `@container`, never a viewport `@media`.
 *  (b) rendered DOM — a separator that is its own flex item is what lets it wrap onto a line alone.
 *      Grouping each "·" with the text it introduces makes an orphan structurally impossible, and
 *      that grouping IS assertable in jsdom.
 *
 * Plus the ambient-tail button weight: "Share a Signal" sits in an AMBIENT tail, so it must not outrank
 * the overdue work above it with the one action blue.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import { SignalFeedRows } from './signal-feed-rows'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/signals/signal-feed-rows.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first balanced `{…}` block starting at `from`. */
function blockAt(from: number): string {
  const open = css.indexOf('{', from)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error('unterminated block')
}

function ruleBody(pattern: RegExp): string {
  const m = pattern.exec(css)
  expect(m, `expected a rule matching ${pattern}`).not.toBeNull()
  return blockAt(m!.index)
}

function signal(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-dewi', owning_team_id: 'team-hq',
    occurred_at: '2026-07-23T15:57:00Z',
    body: 'Grinder 2 at HQ bar is throwing coarse and needs a burr replacement before open',
    attention: 'Urgent', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-23T15:57:00Z',
    ...overrides,
  }
}

function renderRows(props: Partial<React.ComponentProps<typeof SignalFeedRows>> = {}) {
  return render(
    <I18nProvider>
      <SignalFeedRows
        signals={[signal()]}
        authorNamesById={{ 'p-dewi': 'Dewi Director' }}
        teamNamesById={{ 'team-hq': 'HQ Operations' }}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('GUARD: the Signal row adapts to its CONTAINER, not the viewport', () => {
  it('the feed establishes an inline-size container query context', () => {
    const body = ruleBody(/\.home-signal-feed\s*\{/)
    expect(body).toMatch(/container-type:\s*inline-size|container:\s*[\w-]+\s*\/\s*inline-size/)
  })

  it('the narrow-row stack rule is an @container query, not a viewport @media', () => {
    const idx = css.search(/@container[^{]*\(\s*max-width:\s*480px\s*\)/)
    expect(idx, 'signal-feed-rows.css must stack the row on a narrow CONTAINER').toBeGreaterThanOrEqual(0)
    expect(blockAt(idx)).toMatch(/\.home-signal-row\s*\{[^}]*flex-direction:\s*column/)
  })

  it('no viewport @media may drive the row anatomy (that is the 1440px defect)', () => {
    for (const m of css.matchAll(/@media[^{]*\{/g)) {
      expect(
        blockAt(m.index),
        'the row anatomy must key off the container, never the window width',
      ).not.toMatch(/\.home-signal-row\s*\{/)
    }
  })

  it('the base row stays horizontal so a wide container (the archive Feed) is unchanged', () => {
    const base = css.slice(0, css.search(/@container|@media/))
    expect(base).toMatch(/\.home-signal-row\s*\{[^}]*display:\s*flex/)
    expect(base).not.toMatch(/\.home-signal-row\s*\{[^}]*flex-direction:\s*column/)
  })
})

describe('GUARD: a meta separator can never wrap onto a line of its own', () => {
  it('every "·" travels with the text it introduces (never a standalone wrap unit)', () => {
    const { container } = renderRows()
    const meta = container.querySelector('.home-signal-meta')
    expect(meta).not.toBeNull()
    const seps = [...meta!.querySelectorAll('.home-signal-sep')]
    expect(seps.length).toBeGreaterThan(0)
    for (const sep of seps) {
      const group = sep.parentElement!
      // A separator that is a direct child of the wrapping flex row is its OWN wrap unit — that is
      // exactly how the bare "·" landed alone on a line at 300px.
      expect(group, 'a separator must be grouped, not a direct child of the wrapping meta row')
        .not.toBe(meta)
      // The group must actually carry the label the separator introduces.
      expect(group.textContent!.replace(/·/g, '').trim().length).toBeGreaterThan(0)
    }
  })

  it('the meta group is one non-breaking inline unit in CSS', () => {
    const body = ruleBody(/\.home-signal-meta-item\s*\{/)
    expect(body).toMatch(/display:\s*inline-flex/)
    expect(body).toMatch(/white-space:\s*nowrap/)
  })
})

describe('GUARD: the ambient "Share a Signal" door is secondary weight, not the one action blue', () => {
  it('renders with the shared secondary button variant', () => {
    renderRows({ onShareClick: vi.fn() })
    const add = screen.getByRole('button', { name: 'Share a Signal' })
    expect(add.className).toMatch(/\bbtn-outline\b/)
    expect(add.className).not.toMatch(/\bbtn-primary\b/)
  })

  it('.home-signal-add paints no primary fill of its own', () => {
    const body = ruleBody(/\.home-signal-add\s*\{/)
    expect(body).not.toMatch(/background[^;]*var\(--primary\)/)
    expect(body).not.toMatch(/border[^;]*var\(--primary\)/)
  })
})
