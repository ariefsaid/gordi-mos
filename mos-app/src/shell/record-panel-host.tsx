import './record-panel-host.css'
import { useEffect, useRef, type ReactNode } from 'react'
import { useIsSplitWidth } from './use-is-split-width'
import { useIsDesktop } from './use-is-desktop'
import { CloseIcon } from './icons'
import { useT } from '@/i18n/use-t'

// ONE overlay grammar for records (spec docs/specs/record-panel-host.spec.md, FR-1). Every
// record tenant — Task, Signal, and eventually Inbox/Deputy — mounts its CONTENT through this
// host so they all open the same way: ≥1100px a non-modal inline <aside> split (the page stays
// live for triage); below that a role=dialog + aria-modal sheet with a scrim, focus trap, Esc,
// and return-focus. The host owns the modal regime, the .drawer shell (width/border/shadow),
// the focus contract, and an optional chrome header (title zone · "Open full page" · ✕ Close).
// Extracted verbatim from the audit-"exemplary" Task drawer (Rule 11 — reuse, no re-invention).

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export type RecordPanelHostProps = {
  /** aria-label for the panel surface (both regimes). */
  label: string
  /** ✕ Close / Esc / scrim → underlying page, focus returned to the opener. */
  onClose: () => void
  /** The record content (e.g. TaskSurface, SignalRecordHost) — chrome-free. */
  children: ReactNode
  /** Promotes the split aside to full width (Task expand) → adds `.expanded`. */
  expanded?: boolean
  /** Re-run the open-focus + trap wiring when this changes (e.g. a fresh record mounts). */
  focusKey?: string
  /** When set, the host renders its chrome header (title zone · optional Open-full-page · ✕). */
  title?: ReactNode
  /** "Open full page ⤢" — rendered in the chrome when a canonical page exists for this record. */
  onOpenPage?: () => void
  /** Extra identity class on the panel (aside in split, .drawer-modal-root in modal). */
  rootClassName?: string
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
  label, onClose, children, expanded, focusKey, title, onOpenPage, rootClassName,
}: RecordPanelHostProps) {
  const isSplit = useIsSplitWidth()
  const isDesktop = useIsDesktop()
  const isModal = !isSplit
  const isFullScreen = !isDesktop // <768px: full-screen modal
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

    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    return () => {
      invokerRef.current?.focus?.()
    }
  }, [focusKey, isModal])

  // Modal-only: focus trap (on the panel) + Esc (on the document, since the modal owns the
  // whole screen and focus may rest on the body/scrim).
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
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    panel.addEventListener('keydown', onTrapKeyDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      panel.removeEventListener('keydown', onTrapKeyDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [isModal, focusKey, onClose])

  const chrome = title != null && (
    <div className="record-panel-chrome">
      <span className="record-panel-title">{title}</span>
      <span className="record-panel-spacer" />
      {onOpenPage && (
        <button
          type="button"
          className="record-panel-btn"
          aria-label={t('record.openFullPage')}
          title={t('record.openFullPage')}
          onClick={onOpenPage}
        >
          <OpenPageIcon />
        </button>
      )}
      <button
        type="button"
        className="record-panel-btn"
        aria-label={t('record.close')}
        title={t('record.close')}
        onClick={onClose}
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
    const asideClass = ['drawer', expanded ? 'expanded' : '', rootClassName ?? '']
      .filter(Boolean).join(' ')
    return (
      <aside ref={panelRef} className={asideClass} aria-label={label}>
        {body}
      </aside>
    )
  }

  // ── Modal (<1100px): dialog + scrim + trap ──────────────────────────────────
  const rootClass = ['drawer-modal-root', rootClassName ?? ''].filter(Boolean).join(' ')
  const sheetClass = [
    'drawer', 'drawer-modal',
    isFullScreen ? 'drawer-fullscreen' : 'drawer-sheet',
    expanded ? 'expanded' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        className={sheetClass}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {body}
      </aside>
    </div>
  )
}
