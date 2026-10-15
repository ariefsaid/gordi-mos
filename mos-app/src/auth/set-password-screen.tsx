import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/use-t'
import { passwordRefusal } from './password-error'
import { AuthShell, AuthCard } from './auth-shell'
import { SetPasswordForm } from './set-password-form'

// #131 — blocking surface for a viewer whose password was chosen by (and is known to) the admin
// who provisioned it. Rendered in place by ProtectedRoute, the same way OrphanScreen is: no nav,
// no app content, and the ONLY other action is signing out.
//
// There is exactly one step. GoTrue owns the password (#130 installs its policy), and the
// clear_must_change_password_on_pw_change trigger on auth.users lowers the flag as part of GoTrue's
// own write — so by the time updateUser returns, the gate is already down. Nothing here clears it,
// and nothing can: the app has no way to lower the flag other than actually changing the password.
export function SetPasswordScreen({ signOut }: { signOut: () => void | Promise<void> }) {
  const t = useT()
  async function handleSubmit(password: string): Promise<string | null> {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return t(passwordRefusal(error))

    // ponytail: a full reload re-bootstraps AuthProvider so the cleared flag is picked up.
    // Swap for a refreshViewer() on AuthContext if the reload ever reads as jarring.
    location.reload()
    return null
  }

  return (
    <AuthShell>
      <AuthCard>
        <SetPasswordForm
          title={t('auth.password.setTitle')}
          subtitle={t('auth.password.gateSubtitle')}
          onSubmit={handleSubmit}
          footer={(busy) => (
            // Escape hatch — without it, anyone who can't choose a password right now is trapped
            // in the gate with no way back out of the app. A text action, not full-width, set clear
            // of the primary: it drops the session with no confirmation, so it must not sit in the
            // thumb-miss zone of the button above it.
            <div className="password-gate-exit">
              <button type="button" disabled={busy} className="auth-link" onClick={() => void signOut()}>
                {t('auth.password.signOut')}
              </button>
            </div>
          )}
        />
      </AuthCard>
    </AuthShell>
  )
}
