// OAuthConsentPage — where the sign-in service sends a person to approve an AI agent's access
// (`/oauth/consent?authorization_id=…`, ADR-0060 D7). It names the agent app, who it acts as, where
// the browser goes next and what it may and may not do, then asks Allow or Deny.
//
// Hiding Allow is an affordance only: the database refuses an untrusted agent app or a person
// without `agent.connect` regardless of this page (D5). The page never touches a code or token.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { agentRedirectLabel, isSafeAgentRedirect, redirectToAgent } from '@/lib/agent-redirect'
import {
  decideConsent,
  loadConsentGate,
  loadConsentRequest,
  type ConsentGate,
  type ConsentRequest,
} from '@/lib/db/agent-consent'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import './oauth-consent-page.css'

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

  useEffect(() => {
    let live = true
    const settle = (next: View) => live && setView(next)
    settle({ kind: 'loading' })
    if (!authorizationId) {
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
  }, [authorizationId, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const title = t('consent.title')
  const frame = (state: 'default' | 'loading' | 'empty' | 'error' | 'permission', body: React.ReactNode) => (
    <PageFamilyFrame family="management" title={title} state={state}>
      {body}
    </PageFamilyFrame>
  )

  switch (view.kind) {
    case 'loading':
      return frame('loading', <LoadingShell count={4} label={t('consent.loading')} />)
    case 'redirecting':
      return frame('loading', <LoadingShell count={2} label={t('consent.returning')} />)
    case 'unknown':
      return frame(
        'empty',
        <EmptyState variant="blank" autoFocus title={t('consent.unknown.title')} copy={t('consent.unknown.copy')}>
          <Link to="/" className="btn btn-outline">{t('nav.home')}</Link>
        </EmptyState>,
      )
    case 'error':
      return frame('error', <ErrorState message={t('consent.loadError')} onRetry={retry} />)
    case 'ready':
      return frame(view.gate.canConnect && view.gate.trustedName ? 'default' : 'permission',
        <ConsentCard request={view.request} gate={view.gate} onDone={() => setView({ kind: 'redirecting' })} />)
  }
}

function ConsentCard({ request, gate, onDone }: { request: ConsentRequest; gate: ConsentGate; onDone: () => void }) {
  const t = useT()
  const auth = useAuth()
  const headingId = useId()
  const reasonId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => { headingRef.current?.focus() }, [])

  const name = gate.trustedName ?? request.clientName
  const person = auth.status === 'authenticated' ? auth.viewer.person.full_name : request.userEmail
  const reason = !gate.canConnect ? t('consent.noPermission') : !gate.trustedName ? t('consent.untrusted') : null

  const decide = async (decision: 'approve' | 'deny') => {
    if (inFlight.current) return
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
      <p className="consent__line">{t('consent.actsAs', { name: person, email: request.userEmail })}</p>
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
      {reason && <p id={reasonId} className="consent__reason">{reason}</p>}
      {failed && <ErrorState message={t('consent.decideError')} />}
      <div className="consent__actions">
        <Button
          variant="primary"
          disabled={busy || reason !== null}
          aria-describedby={reason ? reasonId : undefined}
          onClick={() => void decide('approve')}
        >
          {t('consent.allow')}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void decide('deny')}>
          {t('consent.deny')}
        </Button>
      </div>
    </section>
  )
}
