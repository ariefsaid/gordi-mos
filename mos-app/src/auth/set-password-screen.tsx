import { useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { clearMustChangePassword } from '@/lib/db/account'
import { AuthShell, AuthCard } from './auth-shell'
import { SetPasswordForm } from './set-password-form'

// #131 — blocking surface for a viewer whose password was chosen by (and is known to) the admin
// who provisioned it. Rendered in place by ProtectedRoute, the same way OrphanScreen is: no nav,
// no app content, and the ONLY other action is signing out.
//
// Two steps, deliberately not one atomic RPC: GoTrue owns the password (#130 installs its policy,
// which an RPC writing encrypted_password directly would bypass), and
// shared.clear_must_change_password() only lowers the flag.
export function SetPasswordScreen({ signOut }: { signOut: () => void | Promise<void> }) {
  // If updateUser succeeded but clearing the flag did not, the password is ALREADY changed. Retrying
  // step 1 would then be rejected by GoTrue as `same_password` and the user would be stuck in a loop
  // they cannot see the cause of. Remember it and resume at step 2.
  const passwordAlreadySet = useRef(false)

  async function handleSubmit(password: string): Promise<string | null> {
    if (!passwordAlreadySet.current) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        // weak_password carries GoTrue's own policy text, which is the useful message here. Any
        // other error stays generic rather than passing an unallowlisted backend string through.
        if (error.code === 'weak_password') return error.message
        return "Couldn't set that password — try again."
      }
      passwordAlreadySet.current = true
    }

    // Throws → SetPasswordForm surfaces the message and the gate stays up. That fails safe: it errs
    // toward asking again, never toward skipping the gate.
    await clearMustChangePassword()

    // ponytail: a full reload re-bootstraps AuthProvider so the cleared flag is picked up.
    // Swap for a refreshViewer() on AuthContext if the reload ever reads as jarring.
    location.reload()
    return null
  }

  return (
    <AuthShell>
      <AuthCard>
        <SetPasswordForm
          title="Set a new password"
          subtitle="Someone else set the password you just used. Choose one only you know."
          onSubmit={handleSubmit}
          footer={(busy) => (
            // Escape hatch — without it, anyone who can't choose a password right now is trapped
            // in the gate with no way back out of the app. Deliberately NOT full-width and set well
            // clear of the primary: it drops the session with no confirmation, so it must not sit in
            // the thumb-miss zone of the button above it.
            <div className="flex justify-center" style={{ marginTop: 20 }}>
              <button
                type="button"
                disabled={busy}
                className="text-primary font-medium rounded-sm px-3 hover:underline focus-visible:underline"
                style={{ height: 32, fontSize: 16, opacity: busy ? 0.5 : 1 }}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          )}
        />
      </AuthCard>
    </AuthShell>
  )
}
