import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordPanelHost } from './record-panel-host'

// The RecordPanelHost is the ONE overlay grammar every record tenant (Task, Signal, …) mounts
// through (spec record-panel-host.spec.md, FR-1). These tests drive the dual modal regime, the
// focus contract, and the optional chrome directly — the behavioral proof the host owns them.

// Width-regime stub mirroring task-drawer.test.tsx: control which of the 1100/920/768 queries
// match so we can exercise the split / overlay-band / mobile regimes deterministically.
function stubWidths({ split, band, desktop }: { split: boolean; band?: boolean; desktop?: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes('1100')) matches = split
      else if (query.includes('920')) matches = band ?? false
      else if (query.includes('768')) matches = desktop ?? true
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

function renderHost(props: Partial<React.ComponentProps<typeof RecordPanelHost>> = {}) {
  return render(
    <I18nProvider>
      <RecordPanelHost label="Signal" onClose={props.onClose ?? vi.fn()} {...props}>
        {props.children ?? <button type="button">record body</button>}
      </RecordPanelHost>
    </I18nProvider>,
  )
}

beforeEach(() => {
  stubWidths({ split: true, desktop: true }) // default: the ≥1100px non-modal split regime
})

describe('RecordPanelHost — dual modal regime (FR-1)', () => {
  it('≥1100px split: renders a non-modal <aside> (no role=dialog, no aria-modal, no scrim)', () => {
    renderHost({ label: 'Signal' })
    const aside = screen.getByRole('complementary', { name: 'Signal' })
    expect(aside.tagName).toBe('ASIDE')
    expect(aside.getAttribute('role')).toBeNull()
    expect(aside.getAttribute('aria-modal')).toBeNull()
    expect(aside).toHaveClass('drawer')
    expect(document.querySelector('.drawer-scrim')).toBeNull()
    expect(document.querySelector('.drawer-modal-root')).toBeNull()
  })

  it('<1100px overlay band: renders role=dialog + aria-modal + scrim as a right-side sheet', () => {
    stubWidths({ split: false, band: true, desktop: true })
    renderHost({ label: 'Signal' })
    const dialog = screen.getByRole('dialog', { name: 'Signal' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog).toHaveClass('drawer', 'drawer-modal', 'drawer-sheet')
    expect(document.querySelector('.drawer-scrim')).toBeTruthy()
    expect(document.querySelector('.drawer-modal.drawer-fullscreen')).toBeNull()
  })

  it('<768px mobile: renders the modal full-screen (drawer-fullscreen, not drawer-sheet)', () => {
    stubWidths({ split: false, band: false, desktop: false })
    renderHost({ label: 'Signal' })
    screen.getByRole('dialog', { name: 'Signal' })
    expect(document.querySelector('.drawer-modal.drawer-fullscreen')).toBeTruthy()
    expect(document.querySelector('.drawer-modal.drawer-sheet')).toBeNull()
  })

  it('expanded promotes the split aside to full width (.drawer.expanded)', () => {
    renderHost({ label: 'Signal', expanded: true })
    expect(document.querySelector('.drawer.expanded')).toBeTruthy()
  })

  it('rootClassName rides the panel for tenant identity', () => {
    renderHost({ label: 'Signal', rootClassName: 'signal-record-drawer-root' })
    expect(document.querySelector('.drawer.signal-record-drawer-root')).toBeTruthy()
  })
})

describe('RecordPanelHost — close/Esc/scrim (FR-1 / I2)', () => {
  it('modal Esc closes → onClose', () => {
    stubWidths({ split: false, band: true, desktop: true })
    const onClose = vi.fn()
    renderHost({ onClose })
    const dialog = screen.getByRole('dialog', { name: 'Signal' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('modal scrim click closes → onClose', () => {
    stubWidths({ split: false, band: true, desktop: true })
    const onClose = vi.fn()
    renderHost({ onClose })
    fireEvent.click(document.querySelector('.drawer-scrim')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('split regime does NOT Esc-close (non-modal: the page stays live for triage)', () => {
    const onClose = vi.fn()
    renderHost({ onClose })
    const aside = screen.getByRole('complementary', { name: 'Signal' })
    fireEvent.keyDown(aside, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('RecordPanelHost — optional chrome (FR-1: title zone · Open full page · ✕ Close)', () => {
  it('no title → no chrome (the tenant owns its own header — Task zero-change path)', () => {
    renderHost({ label: 'Signal' })
    expect(document.querySelector('.record-panel-chrome')).toBeNull()
  })

  it('title → renders the chrome header with the title zone and a ✕ Close', () => {
    const onClose = vi.fn()
    renderHost({ title: 'Signal', onClose })
    expect(document.querySelector('.record-panel-chrome')).toBeTruthy()
    expect(screen.getByText('Signal', { selector: '.record-panel-title' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('onOpenPage → renders the "Open full page" escalation that calls it', () => {
    const onOpenPage = vi.fn()
    renderHost({ title: 'Signal', onOpenPage })
    fireEvent.click(screen.getByRole('button', { name: /open full page/i }))
    expect(onOpenPage).toHaveBeenCalledTimes(1)
  })

  it('no onOpenPage → no "Open full page" button (chrome without a canonical page)', () => {
    renderHost({ title: 'Signal' })
    expect(screen.queryByRole('button', { name: /open full page/i })).toBeNull()
  })
})

describe('RecordPanelHost — focus contract (FR-1)', () => {
  it('moves focus into the panel on open, and returns it to the opener on close', () => {
    const opener = document.createElement('button')
    opener.textContent = 'open'
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const { unmount } = renderHost({
      children: <button type="button">first control</button>,
    })
    // On open, focus lands on the first focusable inside the panel.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'first control' }))

    unmount()
    // On close, focus returns to the invoking control.
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
