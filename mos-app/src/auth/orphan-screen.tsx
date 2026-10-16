import { useAuth } from './use-auth'
import { AuthShell, AuthCard } from './auth-shell'
import { useT } from '@/i18n/use-t'
import { Notice } from '@/components/ui/notice'
import { Button } from '@/components/ui/button'
import './orphan-screen.css'

// FR-016: authenticated user with no linked people row sees this blocked screen.
// The only action is sign-out — no nav, no directory read/write (OD-P1-10).
// Design-plan §3 OrphanBlockedPage: AuthShell frame + warning tile + subheading + body + sign-out primary.
export function OrphanScreen() {
  const auth = useAuth()
  const t = useT()
  const signOut = auth.status === 'orphan' ? auth.signOut : undefined

  return (
    <AuthShell>
      <AuthCard>
        <h1 className="page-title">{t('auth.orphan.title')}</h1>
        <Notice tone="attention"><strong>{t('auth.orphan.status')}</strong></Notice>

        <div className="orphan-guidance">
          <p className="orphan-explanation">{t('auth.orphan.explanation')}</p>
          <p>{t('auth.orphan.handoff')}</p>
        </div>

        {/* Sign out — the ONE primary button on this screen */}
        <Button
          variant="primary"
          className="btn-touch orphan-signout"
          onClick={() => signOut?.()}
          // autoFocus intentional: single-action blocking screen — keyboard users land on exit (design-plan §5)
          autoFocus
        >
          {t('auth.signOut')}
        </Button>
      </AuthCard>
    </AuthShell>
  )
}
