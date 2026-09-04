import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordPanelHost } from './record-panel-host'

// The RecordPanelHost is the ONE overlay grammar every record tenant (Task, Signal, …) mounts
// through. These tests drive the dual modal regime, the
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

  it('GAP-2 (OD-91 #7): the host has no expand-to-full-width promotion (expand-in-place retired)', () => {
    renderHost({ label: 'Signal' })
    // The split aside is a plain fixed-width .drawer — never the retired .drawer.expanded.
    expect(document.querySelector('.drawer')).toBeTruthy()
    expect(document.querySelector('.drawer.expanded')).toBeNull()
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

  // Plan 2026-07-20-v3-overlay-host Task 4 (deliberate change): Escape returns ONE navigation
  // level in every regime, including the ≥1100px non-modal split, routed through the host's
  // leaveGuard as intent 'escape'. This supersedes the old "split does NOT Esc-close" goal.
  it('split regime Esc closes with the escape intent (I2 leaveGuard path — plan Task 4)', () => {
    const onClose = vi.fn()
    renderHost({ onClose })
    const aside = screen.getByRole('complementary', { name: 'Signal' })
    fireEvent.keyDown(aside, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenLastCalledWith('escape')
  })
})

describe('RecordPanelHost — optional chrome (FR-1: title zone · Open full page · ✕ Close)', () => {
  // P1-2 (Luna-measured 32px, docs/reviews): the old CSS was 32px everywhere except a single
  // CSS-scoped mobile-sheet context (.drawer-modal.drawer-fullscreen), so ANY other coarse-pointer
  // host of this same button class (the TaskSurface standalone full-page record-chrome row) fell
  // through unconditionally to 32px — the exact bug Luna measured. The coarse-pointer pattern
  // (record-viewer.css `@media (pointer: fine) and (min-width: 768px)` tighten-down) inverts the default: 44px is the
  // RESTING size everywhere, and only a genuine fine pointer (desktop mouse) tightens to 32px.
  it('defaults to the 44px touch floor and tightens to the 32px control token only for a fine pointer at desktop width', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/shell/record-panel-host.css'), 'utf8')
    expect(css).toMatch(/\.record-panel-btn\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/s)
    // #708: a bare `(pointer: fine)` query fired at phone width too (a resized desktop window,
    // a non-touch mobile emulation both report a fine pointer), tightening Close/Ask Deputy to
    // 32×32 under the 767px floor. `and (min-width: 768px)` confines the tighten-down to desktop.
    expect(css).toMatch(/@media \(pointer: fine\) and \(min-width: 768px\)\s*\{\s*\.record-panel-btn\s*\{\s*width:\s*32px;\s*height:\s*32px;\s*\}/s)
  })

  it('no title → no chrome (the tenant owns its own header — Task zero-change path)', () => {
    renderHost({ label: 'Signal' })
    expect(document.querySelector('.record-panel-chrome')).toBeNull()
  })

  it('title → renders the chrome header with the title zone and a ✕ Close', () => {
    const onClose = vi.fn()
    renderHost({ title: 'Signal', onClose })
    expect(document.querySelector('.record-panel-chrome')).toBeTruthy()
    expect(screen.getByText('Signal', { selector: '.record-panel-title' })).toBeInTheDocument()
    const close = screen.getByRole('button', { name: /^close$/i })
    expect(close).toHaveAttribute('aria-label', 'Close')
    expect(close).toHaveClass('record-panel-btn', 'tap-floor')
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('onOpenPage → renders the "Open full page" escalation that calls it', () => {
    const onOpenPage = vi.fn()
    renderHost({ title: 'Signal', onOpenPage })
    const btn = screen.getByRole('button', { name: /open full page/i })
    // H3 (Luna floor): the escalation carries an EXPLICIT visible label (E7 grammar), not an
    // unlabelled glyph — the panel's most consequential control must read, not be guessed.
    expect(within(btn).getByText('Open full page')).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onOpenPage).toHaveBeenCalledTimes(1)
  })

  it('no onOpenPage → no "Open full page" button (chrome without a canonical page)', () => {
    renderHost({ title: 'Signal' })
    expect(screen.queryByRole('button', { name: /open full page/i })).toBeNull()
  })
})

describe('RecordPanelHost — shell parity across tenants (AC-RPH-2)', () => {
  it('the .drawer shell (width/border/shadow) is identical whether or not the tenant uses host chrome', () => {
    // A Task drawer keeps its own header (no host chrome); a Signal panel uses the host chrome.
    // Either way the OUTER .drawer surface — which carries width/border/shadow — is the same, so
    // both records "open the same way, same side, same width" (the owner's cohesion ask).
    const { unmount } = renderHost({ label: 'Task', children: <div>task body</div> })
    const taskShell = screen.getByRole('complementary', { name: 'Task' }).className
    unmount()

    renderHost({ label: 'Signal', title: 'Signal', onOpenPage: vi.fn() })
    const signalShell = screen.getByRole('complementary', { name: 'Signal' }).className

    expect(signalShell).toBe(taskShell) // identical shell classes → identical width/border/shadow
    expect(signalShell.split(/\s+/)).toContain('drawer')
  })
})

describe('RecordPanelHost — overlay-host oracle + stack chrome (V3 Issue 4)', () => {
  // The oracle attrs ride the SHEET aside in BOTH regimes so a Playwright geometry check
  // measures the panel itself, never the full-viewport modal root (review Minor fix).
  it('modal regime: the oracle attrs ride the sheet <aside>, not the modal root', () => {
    stubWidths({ split: false, band: true, desktop: true })
    renderHost({ label: 'Signal', owner: 'signals', entryKey: 'signal:42' })
    const host = document.querySelector<HTMLElement>('[data-overlay-host="true"]')
    expect(host).toBeTruthy()
    expect(host!.tagName).toBe('ASIDE')
    expect(host!.getAttribute('role')).toBe('dialog')
    expect(host!.getAttribute('data-overlay-owner')).toBe('signals')
    expect(host!.getAttribute('data-overlay-entry')).toBe('signal:42')
    // the modal root wrapper no longer carries the oracle (it is not the sheet)
    expect(document.querySelector('.drawer-modal-root')!.getAttribute('data-overlay-host')).toBeNull()
  })

  it('split regime: the oracle attrs ride the non-modal <aside> panel', () => {
    renderHost({ label: 'Signal', owner: 'signals', entryKey: 'signal:42' })
    const host = document.querySelector<HTMLElement>('[data-overlay-host="true"]')
    expect(host!.tagName).toBe('ASIDE')
    expect(host).toHaveClass('drawer')
    expect(host!.getAttribute('data-overlay-owner')).toBe('signals')
  })

  it('no owner → no data-overlay-host oracle (a bare tenant render stays anonymous)', () => {
    renderHost({ label: 'Signal' })
    expect(document.querySelector('[data-overlay-host]')).toBeNull()
  })

  it('I2 canGoBack → renders a Back control that pops one frame via onBack', () => {
    const onBack = vi.fn()
    renderHost({ label: 'Signal', title: 'Signal', canGoBack: true, onBack })
    const back = screen.getByRole('button', { name: /back/i })
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('no canGoBack → no Back control (a root frame has nothing to pop to)', () => {
    renderHost({ label: 'Signal', title: 'Signal' })
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
  })

  it('transitionPending → chrome controls are disabled + aria-busy while the guard resolves', () => {
    renderHost({
      label: 'Signal',
      title: 'Signal',
      canGoBack: true,
      onBack: vi.fn(),
      onOpenPage: vi.fn(),
      transitionPending: true,
    })
    const close = screen.getByRole('button', { name: /^close$/i })
    expect(close).toBeDisabled()
    expect(close.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /open full page/i })).toBeDisabled()
  })

  it('close/scrim carry the explicit-close intent; Esc carries escape (I2 via)', () => {
    stubWidths({ split: false, band: true, desktop: true })
    const onClose = vi.fn()
    renderHost({ label: 'Signal', title: 'Signal', onClose })
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).toHaveBeenLastCalledWith('explicit-close')
    fireEvent.click(document.querySelector('.drawer-scrim')!)
    expect(onClose).toHaveBeenLastCalledWith('explicit-close')
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Signal' }), { key: 'Escape' })
    expect(onClose).toHaveBeenLastCalledWith('escape')
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

  // DO-15(e) (census-sweep R2, task-create F8): with the chrome bar present (title + ✕
  // rendered BEFORE the content in the DOM), open-focus still lands on the CONTENT's first
  // focusable — e.g. the create form's Title field — never the chrome's close button.
  it('DO-15(e): open-focus lands on the content first focusable, not the chrome close', () => {
    renderHost({
      label: 'Create task',
      title: 'Create task',
      children: <input aria-label="Title" />,
    })
    // The chrome close exists and precedes the content…
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument()
    // …but focus enters on the content control.
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))
  })

  it('DO-15(e): a chrome-only panel falls back to the first chrome control so focus still enters', () => {
    renderHost({
      label: 'Read-only',
      title: 'Read-only',
      children: <p>nothing focusable here</p>,
    })
    expect(document.activeElement?.closest('.record-panel-chrome')).toBeTruthy()
  })
})

// ── WCAG 2.1 AA on the phone regime (#190, authored here per DD-WAY-21) ──────────────────────
// A record panel on a phone is the case most likely to be wrong: it is the ONLY regime where the
// panel owns the whole screen, so it is the only one where a leak out of the trap strands the user
// on a page they cannot see. v4's suite proves focus ENTERS and RETURNS and that Escape closes; it
// never proves the trap wraps, that the panel announces itself, or that its surface is not a
// fixed-width column on a 390px screen.
describe('RecordPanelHost — phone regime a11y (NFR-003 / AC-022)', () => {
  const phone = () => stubWidths({ split: false, band: false, desktop: false })

  it('announces itself: role=dialog + aria-modal + an accessible name from `label`', () => {
    phone()
    renderHost({ label: 'Signal record' })
    const dialog = screen.getByRole('dialog', { name: 'Signal record' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // The name comes from the prop, not from happening to contain that text.
    expect(dialog.getAttribute('aria-label')).toBe('Signal record')
  })

  it('traps Tab inside the sheet: last → first forward, first → last backward', () => {
    // The host's trap filters to elements jsdom would call laid out (`offsetParent !== null`), and
    // jsdom gives every element a null offsetParent. Without this stub the filter collapses to the
    // single focused element, first === last, and the two assertions below pass whatever the trap
    // does — the vacuum this case exists to avoid. Restored in the finally.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() { return document.body },
    })
    try {
      phone()
      renderHost({
        label: 'Signal',
        title: 'Signal',
        children: (
          <>
            <button type="button">first control</button>
            <button type="button">last control</button>
          </>
        ),
      })
      const dialog = screen.getByRole('dialog', { name: 'Signal' })
      const controls = within(dialog).getAllByRole('button')
      expect(controls.length).toBeGreaterThan(1) // a one-control panel cannot prove a wrap
      const first = controls[0]
      const last = controls.at(-1)!

      last.focus()
      fireEvent.keyDown(dialog, { key: 'Tab' })
      expect(document.activeElement).toBe(first)

      first.focus()
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetParent
    }
  })

  it('the split regime does NOT trap — the page beside it stays reachable by Tab', () => {
    // The trap is a property of owning the whole screen. At ≥1100px the collection is live beside
    // the panel, so trapping there would strand the user in the panel. Asserted as the negative of
    // the case above so the two regimes cannot silently converge.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() { return document.body },
    })
    try {
      stubWidths({ split: true, desktop: true })
      renderHost({
        label: 'Signal',
        title: 'Signal',
        children: (
          <>
            <button type="button">first control</button>
            <button type="button">last control</button>
          </>
        ),
      })
      const aside = screen.getByRole('complementary', { name: 'Signal' })
      const controls = within(aside).getAllByRole('button')
      const last = controls.at(-1)!
      last.focus()
      fireEvent.keyDown(aside, { key: 'Tab' })
      // No wrap: focus is left exactly where the browser's own Tab order will take it.
      expect(document.activeElement).toBe(last)
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetParent
    }
  })

  it('is dismissible by keyboard alone — Escape closes with the escape intent', () => {
    phone()
    const onClose = vi.fn()
    renderHost({ label: 'Signal', title: 'Signal', onClose })
    // Escape is listened for on the DOCUMENT in the modal regime, because the sheet owns the whole
    // screen and focus may rest anywhere inside it.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenLastCalledWith('escape')
  })

  it('every chrome control keeps an accessible name and stays in the Tab order', () => {
    phone()
    renderHost({
      label: 'Signal',
      title: 'Signal',
      canGoBack: true,
      onBack: vi.fn(),
      onOpenPage: vi.fn(),
    })
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('.record-panel-chrome button'),
    )
    expect(controls.length).toBe(3) // Back · Open full page · Close
    for (const control of controls) {
      expect(control.getAttribute('aria-label')?.trim()).toBeTruthy()
      expect(control.getAttribute('tabindex')).not.toBe('-1')
    }
  })

  it('the phone sheet is viewport-sized, never a fixed-width column (no 390px overflow)', () => {
    // jsdom computes no layout, so the geometry claim is asserted against the stylesheet — the
    // same technique the 44px touch-floor case above uses. What would produce a horizontal scroll
    // at 390px is a sheet wider than the viewport, so the rule that owns the phone surface must
    // size itself from the viewport and set no px width.
    phone()
    renderHost({ label: 'Signal' })
    expect(document.querySelector('.drawer-modal.drawer-fullscreen')).toBeTruthy()

    const css = readFileSync(resolve(process.cwd(), 'src/styles/drawer.css'), 'utf8')
    const fullscreen = css.slice(css.indexOf('.drawer-modal.drawer-fullscreen {'))
    const body = fullscreen.slice(fullscreen.indexOf('{') + 1, fullscreen.indexOf('}'))
    expect(body).toMatch(/inset:\s*0/)
    expect(body).toMatch(/width:\s*auto/)
    expect(body).not.toMatch(/width:\s*\d+px/)
    // The band sheet also collapses to full-bleed below 768px rather than leaving a half-width
    // column with the page bleeding through beside it.
    expect(css).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.drawer-modal\.drawer-sheet\s*\{[^}]*width:\s*auto/s)
  })
})
