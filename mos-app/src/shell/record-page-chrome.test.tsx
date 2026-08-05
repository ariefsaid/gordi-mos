// RecordPageChrome — the ONE chrome a STANDALONE record page renders, for every record kind.
//
// AUTHORED HERE (#190, DD-WAY-21). v4 ships this component with no test file at all, and the thing
// it exists to prevent is a per-surface fork: Task's full page carried a Back affordance baked into
// its own surface and the Signal full page carried none. So the cases below are about the SHARED
// contract — a labelled Back, source-aware, identical whatever renders inside it — not about any
// one kind.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordPageChrome } from './record-page-chrome'

function renderChrome(props: Partial<React.ComponentProps<typeof RecordPageChrome>> = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <RecordPageChrome
          backTo={props.backTo ?? { pathname: '/work/signals', search: '?view=mine' }}
          backLabel={props.backLabel ?? 'Signals'}
          trailing={props.trailing}
        />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('RecordPageChrome', () => {
  it('renders a LABELLED Back link naming the collection, not an unlabelled glyph', () => {
    renderChrome({ backLabel: 'Signals' })
    const back = screen.getByRole('link', { name: 'Back to Signals' })
    // The label is the accessible name AND visible text — the E7 grammar the record surfaces
    // diverged on. An icon-only Back would still satisfy a role query, so the text is asserted.
    expect(back).toHaveTextContent('Back to Signals')
  })

  it('is source-aware: the Back target is the caller\'s, query string included', () => {
    renderChrome({ backTo: { pathname: '/work/signals', search: '?view=mine&q=loss' } })
    expect(screen.getByRole('link', { name: /back to/i })).toHaveAttribute(
      'href',
      '/work/signals?view=mine&q=loss',
    )
  })

  it('names whichever collection the record came from — the chrome is not per-kind', () => {
    const { unmount } = renderChrome({ backLabel: 'Signals', backTo: '/work/signals' })
    const signals = screen.getByRole('link', { name: /back to/i })
    const signalsClass = signals.className
    expect(signals).toHaveTextContent('Back to Signals')
    unmount()

    renderChrome({ backLabel: 'Tasks', backTo: '/work/tasks' })
    const tasks = screen.getByRole('link', { name: /back to/i })
    expect(tasks).toHaveTextContent('Back to Tasks')
    // Same affordance, same skin — a different kind is not a different chrome.
    expect(tasks.className).toBe(signalsClass)
  })

  it('renders a kind-specific trailing control after the Back, when one is given', () => {
    renderChrome({ trailing: <button type="button">Collapse to panel</button> })
    const strip = document.querySelector('[data-viewer-region="page-chrome"]')!
    const controls = Array.from(strip.querySelectorAll('a, button'))
    expect(controls.map((el) => el.textContent)).toEqual([
      'Back to Signals',
      'Collapse to panel',
    ])
  })

  it('renders no trailing controls when the kind has none', () => {
    renderChrome()
    const strip = document.querySelector('[data-viewer-region="page-chrome"]')!
    expect(strip.querySelectorAll('button')).toHaveLength(0)
  })
})
