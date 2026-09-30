// OAuthConsentPage — where the sign-in service sends a person to approve an AI agent's access
// (`/oauth/consent?authorization_id=…`, ADR-0060 D7). It names the agent app, who it acts as, where
// the browser goes next and what it may and may not do, then asks Allow or Deny.
//
// Hiding Allow is an affordance only: the database refuses an untrusted agent app or a person
// without `agent.connect` regardless of this page (D5). The page never touches a code or token.
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { agentRedirectLabel, isSafeAgentRedirect, redirectToAgent } from '@/lib/agent-redirect'
import {
  decideConsent,
  isAuthorizationId,
  loadConsentGate,
  loadConsentRequest,
  type ConsentGate,
  type ConsentRequest,
} from '@/lib/db/agent-consent'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import './oauth-consent-page.css'

// Allow stays inert this long after the card shows and after the window regains focus, so a
// double-click meant for another page cannot land on it (Deny is never delayed).
const ALLOW_DELAY_MS = 600

type View =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'redirecting' }
  | { kind: 'error' }
  | { kind: 'ready'; request: ConsentRequest; gate: ConsentGate }

export function OAuthConsentPage() {
  const t = useT()
  const [params] = useSearchParams()
  const authorizationId = params.get('authorization_id')
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useDocumentTitle(`${t('consent.title')} — Gordi MOS`)
  const framed = window.self !== window.top

  useEffect(() => {
    if (framed) return // a page inside someone else's frame never loads the request
    let live = true
    const settle = (next: View) => live && setView(next)
    settle({ kind: 'loading' })
    if (!isAuthorizationId(authorizationId)) {
      settle({ kind: 'unknown' })
      return () => { live = false }
    }
    void (async () => {
      try {
        const loaded = await loadConsentRequest(authorizationId)
        if (!live) return
        if (loaded.kind === 'unknown') return settle({ kind: 'unknown' })
        if (loaded.kind === 'redirect') {
          // Already decided: go where the service says, never show the buttons again.
          if (!isSafeAgentRedirect(loaded.url)) return settle({ kind: 'error' })
          settle({ kind: 'redirecting' })
          return redirectToAgent(loaded.url)
        }
        const gate = await loadConsentGate(loaded.request.clientId)
        settle({ kind: 'ready', request: loaded.request, gate })
      } catch {
        settle({ kind: 'error' })
      }
    })()
    return () => { live = false }
  }, [authorizationId, attempt, framed])

  const retry = () => setAttempt((count) => count + 1)
  if (framed) return null
  const title = t('consent.title')
  const frame = (state: 'default' | 'loading' | 'empty' | 'error' | 'permission', body: React.ReactNode) => (
    <PageFamilyFrame family="management" title={title} state={state}>
      {body}
    </PageFamilyFrame>
  )

  switch (view.kind) {
    case 'loading':
      return frame('loading', <ConsentSkeleton label={t('consent.loading')} />)
    case 'redirecting':
      return frame('loading', <ConsentSkeleton label={t('consent.returning')} visible />)
    case 'unknown':
      return frame(
        'empty',
        <EmptyState variant="blank" autoFocus title={t('consent.unknown.title')} copy={t('consent.unknown.copy')}>
          <Link to="/" className="btn btn-outline">{t('nav.home')}</Link>
        </EmptyState>,
      )
    case 'error':
      return frame('error', <FocusOnMount><ErrorState message={t('consent.loadError')} onRetry={retry} /></FocusOnMount>)
    case 'ready':
      return frame(view.gate.canConnect && view.gate.trustedName ? 'default' : 'permission',
        <ConsentCard request={view.request} gate={view.gate} onDone={() => setView({ kind: 'redirecting' })} />)
  }
}

// The loading frame has the card's shape, so the card replaces it without a jump.
function ConsentSkeleton({ label, visible = false }: { label: string; visible?: boolean }) {
  return (
    <div className="consent consent--loading">
      {visible && <p className="consent__returning">{label}</p>}
      <LoadingShell
        count={5}
        label={label}
        row={(i) => <div key={i} className={`skeleton-bar consent__skeleton consent__skeleton--${i}`} />}
      />
    </div>
  )
}

// Moves a keyboard or screen-reader user to the message that just appeared.
function FocusOnMount({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <div ref={ref} tabIndex={-1} className="consent__focus">{children}</div>
}

function ConsentCard({ request, gate, onDone }: { request: ConsentRequest; gate: ConsentGate; onDone: () => void }) {
  const t = useT()
  const auth = useAuth()
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [armed, setArmed] = useState(false)

  useEffect(() => { headingRef.current?.focus() }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      setArmed(false)
      clearTimeout(timer)
      timer = setTimeout(() => setArmed(true), ALLOW_DELAY_MS)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') arm() }
    arm()
    window.addEventListener('focus', arm)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', arm)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const name = gate.trustedName ?? t('consent.unnamedAgent')
  const person = auth.status === 'authenticated' ? auth.viewer.person.full_name : request.userEmail
  const reason = !gate.canConnect ? t('consent.noPermission') : !gate.trustedName ? t('consent.untrusted') : null
  // No Allow, and no Deny that would send the browser to an agent app that is not trusted.
  const canDecide = reason === null

  const decide = async (decision: 'approve' | 'deny') => {
    if (inFlight.current || !canDecide) return
    if (decision === 'approve' && !armed) return
    inFlight.current = true
    setBusy(true)
    setFailed(false)
    try {
      const url = await decideConsent(request.authorizationId, decision)
      onDone()
      redirectToAgent(url)
    } catch {
      setFailed(true)
      setBusy(false)
      inFlight.current = false
    }
  }

  return (
    <section className="consent" aria-labelledby={headingId} aria-busy={busy || undefined}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="consent__heading">
        {t('consent.heading', { agent: name })}
      </h2>
      {!gate.trustedName && <p className="consent__tag">{t('consent.notTrusted')}</p>}
      <p className="consent__line consent__line--strong">{t('consent.actsAs', { name: person, email: request.userEmail })}</p>
      <p className="consent__line">
        {t('consent.returnsTo')} <strong className="consent__host">{agentRedirectLabel(request.redirectUri)}</strong>
      </p>
      <div className="consent__lists">
        <div>
          <h3 className="consent__subheading">{t('consent.can.title')}</h3>
          <ul className="consent__list">
            <li>{t('consent.can.read')}</li>
            <li>{t('consent.can.write')}</li>
            <li>{t('consent.can.objectives')}</li>
          </ul>
        </div>
        <div>
          <h3 className="consent__subheading">{t('consent.cannot.title')}</h3>
          <ul className="consent__list consent__list--limits">
            <li>{t('consent.cannot.all')}</li>
          </ul>
        </div>
      </div>
      {reason && <p className="consent__reason">{reason}</p>}
      {failed && <FocusOnMount><ErrorState message={t('consent.decideError')} /></FocusOnMount>}
      <div className="consent__actions">
        {canDecide ? (
          <>
            <Button variant="outline" disabled={busy} onClick={() => void decide('deny')}>
              {t('consent.deny')}
            </Button>
            <Button
              variant="primary"
              className="consent__allow"
              disabled={busy}
              aria-disabled={!armed || undefined}
              onClick={() => void decide('approve')}
            >
              {t('consent.allow')}
            </Button>
          </>
        ) : (
          <Link to="/" className="btn btn-outline">{t('consent.back')}</Link>
        )}
      </div>
    </section>
  )
}
