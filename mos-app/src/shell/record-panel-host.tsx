import './record-panel-host.css'
import { useEffect, useRef, type ReactNode } from 'react'
import { useIsSplitWidth } from './use-is-split-width'
import { useIsDesktop } from './use-is-desktop'
import { useIsNarrow } from './use-is-narrow'
import { CloseIcon, BackIcon } from './icons'
import { useT } from '@/i18n/use-t'
import type { OverlayOwner } from './overlay-navigation'

// ONE overlay grammar for records. Every
// record tenant — Task, Signal, and eventually Inbox/Deputy — mounts its CONTENT through this
// host so they all open the same way: ≥1100px a non-modal inline <aside> split (the page stays
// live for triage); below that a role=dialog + aria-modal sheet with a scrim, focus trap, Esc,
// and return-focus. The host owns the modal regime, the .drawer shell (width/border/shadow),
// the focus contract, and an optional chrome header (title zone · "Open full page" · ✕ Close).
// Extracted verbatim from the audit-"exemplary" Task drawer (Rule 11 — reuse, no re-invention).
//
// (#190: v4's header cites `docs/specs/record-panel-host.spec.md` for the FR-1 numbering. That spec
// is not in this line's docs tree — the port's governing spec is `docs/specs/v4-port.spec.md` — so
// the path is dropped rather than carried as a pointer into nothing. The FR/AC ids the cases below
// use are v4's own and are kept so a reviewer diffing against v4 can still line them up.)

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export type RecordPanelHostProps = {
  /** aria-label for the panel surface (both regimes). */
  label: string
  /** ✕ Close / Esc / scrim → underlying page, focus returned to the opener. `via` distinguishes I2 intents. */
  onClose: (via?: 'explicit-close' | 'escape') => void
  /** The record content (e.g. TaskSurface, SignalRecordHost) — chrome-free. */
  children: ReactNode
  /** Re-run the open-focus + trap wiring when this changes (e.g. a fresh record mounts). */
  focusKey?: string
  /** When set, the host renders its chrome header (title zone · optional Open-full-page · ✕). */
  title?: ReactNode
  /** Optional tenant actions rendered inside the shared chrome before Open/Close. */
  actions?: ReactNode
  /** "Open full page ⤢" — rendered in the chrome when a canonical page exists for this record. */
  onOpenPage?: () => void
  /** Internal Back (I2): pops one stack frame. Only rendered when `canGoBack`. */
  onBack?: () => void
  /** Whether an internal linked-record stack Back control is available. */
  canGoBack?: boolean
  /** Extra identity class on the panel (aside in split, .drawer-modal-root in modal). */
  rootClassName?: string
  /** Overlay-host oracle: which route/shell owner mounts this host. */
  owner?: OverlayOwner
  /** Overlay-host oracle: the active stack entry key. */
  entryKey?: string
  /** True while a leave-guard confirmation is pending; suppresses a second visual transition. */
  transitionPending?: boolean
  /**
   * Companion surfaces reuse this host's chrome/focus/modal contract while remaining beside an
   * already-open record. They become modal only below the 920px shell threshold.
   */
  layout?: 'standard' | 'companion'
  /** A top companion modal captures Escape before a mounted record underneath can consume it. */
  escapeCapture?: boolean
  /** Listen at document scope when a shell companion is the active ambient surface. */
  escapeOnDocument?: boolean
  /** Marks a shared-host companion without claiming it is the primary overlay session frame. */
  companion?: boolean
}

function OpenPageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

/**
 * The shared record overlay host. Two focus regimes, one component (mirrors the Task drawer's
 * AC-110 contract): ≥1100px non-modal <aside> (Tab flows page↔panel, opening moves focus in,
 * closing returns it); <1100px modal dialog (scrim + focus-trap + Esc + return-focus).
 */
export function RecordPanelHost({
  label, onClose, children, focusKey, title, actions, onOpenPage, rootClassName,
  onBack, canGoBack, owner, entryKey, transitionPending, layout = 'standard',
  escapeCapture = false, escapeOnDocument = false, companion = false,
}: RecordPanelHostProps) {
  const isSplit = useIsSplitWidth()
  const isDesktop = useIsDesktop()
  const isNarrow = useIsNarrow()
  const isModal = layout === 'companion' ? isNarrow : !isSplit
  const isFullScreen = layout === 'companion' ? isNarrow : !isDesktop
  const t = useT()

  const panelRef = useRef<HTMLElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)

  // ── Focus management ────────────────────────────────────────────────────────
  // Move focus into the panel on open (both regimes land keyboard/SR users on the
  // new content; only the modal regime traps). Return focus to the opener on close.
  useEffect(() => {
    invokerRef.current = (document.activeElement as HTMLElement) ?? null
    const panel = panelRef.current
    if (!panel) return

    // DO-15(e) (census-sweep R2, task-create F8): open-focus lands on the CONTENT's first
    // focusable (e.g. the create form's Title field, a record's first value control), not the
    // chrome bar's ✕ — the chrome stays reachable by Tab. Chrome-only panels keep their first
    // chrome control as the fallback so focus always enters the panel.
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = focusables.find((el) => !el.closest('.record-panel-chrome')) ?? focusables[0]
    first?.focus()

    return () => {
      invokerRef.current?.focus?.()
    }
  }, [focusKey, isModal])

  // Modal-only: focus trap (on the panel). Tab wraps within the sheet because the modal
  // owns the whole screen; the split regime keeps the page live, so no trap there.
  useEffect(() => {
    if (!isModal) return
    const panel = panelRef.current
    if (!panel) return

    function onTrapKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (focusable.length === 0) return
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault(); lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus()
      }
    }
    panel.addEventListener('keydown', onTrapKeyDown)
    return () => panel.removeEventListener('keydown', onTrapKeyDown)
  }, [isModal, focusKey])

  // Escape closes in BOTH regimes (plan 2026-07-20-v3-overlay-host Task 4 deliberate change):
  // Esc returns one navigation level via onClose('escape'), routed through the host's leaveGuard.
  // Modal listens on the document (it owns the whole screen; focus may rest on body/scrim);
  // the split regime listens on the panel so only a panel-focused Esc closes and the live page
  // keeps its own Esc semantics.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onEsc: EventListener = (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        e.preventDefault()
        if (escapeCapture) e.stopImmediatePropagation()
        onClose('escape')
      }
    }
    const target: Document | HTMLElement = isModal || escapeOnDocument ? document : panel
    target.addEventListener('keydown', onEsc, escapeCapture)
    return () => target.removeEventListener('keydown', onEsc, escapeCapture)
  }, [escapeCapture, escapeOnDocument, isModal, focusKey, onClose])

  // Overlay-host oracle: only the OverlayHostSlot sets `owner`, so a bare tenant render
  // (Task/Signal migration compatibility) stays anonymous. `undefined` values are omitted
  // by React so a slotless render carries no `data-overlay-*` attribute at all.
  const overlayAttrs = owner
    ? companion
      ? {
          'data-overlay-companion': 'true',
          'data-overlay-owner': owner,
          'data-overlay-entry': entryKey,
        }
      : {
          'data-overlay-host': 'true',
          'data-overlay-owner': owner,
          'data-overlay-entry': entryKey,
        }
    : undefined

  const busy = transitionPending ? { disabled: true, 'aria-busy': true } : undefined

  const chrome = (title != null || canGoBack) && (
    <div className="record-panel-chrome">
      {canGoBack && (
        <button
          type="button"
          className="record-panel-btn"
          aria-label={t('record.back')}
          title={t('record.back')}
          onClick={onBack}
          {...busy}
        >
          <BackIcon />
        </button>
      )}
      <span className="record-panel-title">{title}</span>
      <span className="record-panel-spacer" />
      {actions}
      {onOpenPage && (
        <button
          type="button"
          className="record-panel-btn record-panel-btn--labelled"
          aria-label={t('record.openFullPage')}
          title={t('record.openFullPage')}
          onClick={onOpenPage}
          {...busy}
        >
          <OpenPageIcon />
          <span className="record-panel-btn__label">{t('record.openFullPage')}</span>
        </button>
      )}
      <button
        type="button"
        className="record-panel-btn"
        aria-label={t('record.close')}
        title={t('record.close')}
        onClick={() => onClose('explicit-close')}
        {...busy}
      >
        <CloseIcon />
      </button>
    </div>
  )

  const body = (
    <>
      {chrome}
      {children}
    </>
  )

  // ── Non-modal split (≥1100px): plain <aside>, no scrim, no trap ─────────────
  if (!isModal) {
    const asideClass = ['drawer', rootClassName ?? '']
      .filter(Boolean).join(' ')
    return (
      <aside ref={panelRef} className={asideClass} aria-label={label} {...overlayAttrs}>
        {body}
      </aside>
    )
  }

  // ── Modal (<1100px): dialog + scrim + trap ──────────────────────────────────
  const rootClass = ['drawer-modal-root', rootClassName ?? ''].filter(Boolean).join(' ')
  const sheetClass = [
    'drawer', 'drawer-modal',
    isFullScreen ? 'drawer-fullscreen' : 'drawer-sheet',
  ].filter(Boolean).join(' ')

  // The oracle attrs ride the sheet <aside> (the panel itself), matching the split regime,
  // so a Playwright geometry check measures the sheet — not the full-viewport modal root.
  return (
    <div className={rootClass}>
      <div className="drawer-scrim" onClick={() => onClose('explicit-close')} aria-hidden="true" />
      <aside
        ref={panelRef}
        className={sheetClass}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        {...overlayAttrs}
      >
        {body}
      </aside>
    </div>
  )
}
