import { AuthShell, AuthCard } from './auth-shell'
import { useT } from '@/i18n/use-t'
import { Notice } from '@/components/ui/notice'
import { Button } from '@/components/ui/button'

interface Props {
  retry: () => void | Promise<void>
  signOut: () => Promise<void>
}

/**
 * Recoverable error screen when viewer resolution fails.
 * Gives the user a direct Retry action to finish loading the current session,
 * and a Sign out action if they wish to end the session.
 */
export function AuthErrorScreen({ retry, signOut }: Props) {
  const t = useT()

  return (
    <AuthShell>
      <AuthCard>
        <h1 className="page-title">{t('auth.login.title')}</h1>
        <Notice tone="attention" role="alert">
          {t('auth.login.networkError')}
        </Notice>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mos-space-3, 12px)', marginTop: 'var(--mos-space-4, 16px)' }}>
          <Button
            variant="primary"
            className="btn-touch"
            onClick={() => void retry()}
            autoFocus
          >
            {t('network.retry')}
          </Button>
          <Button
            variant="outline"
            className="btn-touch"
            onClick={() => void signOut()}
          >
            {t('auth.signOut')}
          </Button>
        </div>
      </AuthCard>
    </AuthShell>
  )
}
