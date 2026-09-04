// Context files intentionally mix a Provider component with a reader hook —
// the react-refresh rule is suppressed per the established pattern (breadcrumb-title.tsx).
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { can } from '@/lib/capabilities'
import { loadMentionRosters, type MentionRosters } from '@/lib/db/signals'
import { SignalComposer } from '@/components/signals/signal-composer'
import { IconButton } from '@/components/ui/icon-button'
import { ModalShell } from '@/components/ui/modal-shell'
import { CloseIcon } from '@/shell/icons'
import './signal-composer-host.css'

// C1 (AC-428 backing / FR-417): "one command, many entry points." Every Share-Signal entry point
// (⌘K, the mobile Action Launcher, the Home feed's "Share a Signal" row) dispatches the SAME
// open() — it never navigates to a route (FR-417). Mounted once at the shell root (app-shell.tsx)
// so the composer survives across route changes and there is exactly one drawer host (Rule 6).

export interface SignalComposerPrefill {
  body: string
  owningTeamId: string
  occurredAt: string
  attention: 'FYI' | 'Needs attention' | 'Urgent'
}

export interface SignalComposerContextValue {
  open: (prefill?: SignalComposerPrefill) => void
  /** Increments on each successful Share — feed/archive surfaces watch it to reload so a freshly
   * posted Signal appears without a manual refresh (AC-430). */
  postCount: number
}

const SignalComposerContext = createContext<SignalComposerContextValue | null>(null)

export function useSignalComposer(): SignalComposerContextValue {
  const ctx = useContext(SignalComposerContext)
  if (!ctx) throw new Error('useSignalComposer must be used within a SignalComposerHost')
  return ctx
}

const EMPTY_ROSTERS: MentionRosters = { teamMembers: {}, buMembers: {} }

export function SignalComposerHost({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  const [postCount, setPostCount] = useState(0)
  const [rosters, setRosters] = useState<MentionRosters>(EMPTY_ROSTERS)
  const [prefill, setPrefill] = useState<SignalComposerPrefill | undefined>()

  const close = useCallback(() => { setIsOpen(false); setPrefill(undefined) }, [])
  const open = useCallback((nextPrefill?: SignalComposerPrefill) => { setPrefill(nextPrefill); setIsOpen(true) }, [])
  // On a successful Share: bump the post counter (watched by the feed/archive) then close.
  const handleShared = useCallback(() => { setPostCount((n) => n + 1); setPrefill(undefined); setIsOpen(false) }, [])

  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  // KNOWN GAP 1: the composer's AC-422 fan-out preview needs REAL rosters, not the {} default —
  // load them once per open (small at Gordi's ~30-person scale; loadMentionRosters mirrors
  // getPeople()'s whole-org-read pattern). A failed load degrades to an under-count preview rather
  // than blocking capture (Rule 8 — capture never blocks on enrichment data).
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    loadMentionRosters()
      .then((r) => { if (!cancelled) setRosters(r) })
      .catch(() => { if (!cancelled) setRosters(EMPTY_ROSTERS) })
    return () => { cancelled = true }
  }, [isOpen])

  const accessRoles = viewer?.accessRoles ?? []

  return (
    <SignalComposerContext.Provider value={{ open, postCount }}>
      {children}
      {isOpen && viewer && (
        <ModalShell
          open
          onClose={close}
          ariaLabel={t('signals.action.share')}
          closeOnBackdrop
          closeOnEscape
          surface="centered"
          phoneMode="fullscreen"
        >
          <div className="signal-composer-host-panel">
            <div className="signal-composer-host-head">
              <h2 className="signal-composer-host-title">{t('signals.action.share')}</h2>
              <IconButton variant="tertiary" ariaLabel={t('signals.composer.close')} onClick={close}>
                <CloseIcon />
              </IconButton>
            </div>
            <SignalComposer
              authorId={viewer.person.id}
              authorName={viewer.person.full_name}
              canCreateForTeam={can(accessRoles, 'signal.create_for_team')}
              canMentionBu={can(accessRoles, 'signal.mention_bu')}
              teamMembers={rosters.teamMembers}
              buMembers={rosters.buMembers}
              onShared={handleShared}
              prefill={prefill}
            />
          </div>
        </ModalShell>
      )}
    </SignalComposerContext.Provider>
  )
}
