import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { SetPasswordForm } from '@/auth/set-password-form'
import { REAUTHENTICATION_REQUIRED } from '@/auth/reauthentication-required'
import { passwordRefusal } from '@/auth/password-error'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/i18n/I18nProvider'
import { useAccountLocale } from '@/i18n/account-locale'
import type { Locale } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Select } from '@/components/ui/select'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { HomeLayoutPicker } from '@/components/home/home-layout-picker'
import { resolveHomeLayout, setHomeLayout, type HomeLayout } from '@/lib/home-layout'
import { ProfileSectionNav } from '@/components/profile/profile-section-nav'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { Button } from '@/components/ui/button'
import { useIsOffline } from '@/shell/use-is-offline'
import { OfflineNotice } from '@/components/ui/offline-notice'
import { Notice } from '@/components/ui/notice'
import './profile-page.css'


export function ProfilePage() {
  const t = useT()
  const auth = useAuth()
  const { locale } = useI18n()
  const accountLocale = useAccountLocale()
  const [savingLocale, setSavingLocale] = useState(false)
  const [localeSaveFailed, setLocaleSaveFailed] = useState(false)
  const [googleOnly, setGoogleOnly] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [localeSaved, setLocaleSaved] = useState(false)
  const [layoutSaved, setLayoutSaved] = useState(false)
  const offline = useIsOffline()
  useDocumentTitle(t('common.docTitle', { page: t('dest.profile') }))

  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const personId = viewer?.person.id ?? null
  const [homeLayout, setHomeLayoutState] = useState<HomeLayout>(() => personId ? resolveHomeLayout(personId) : 'focused')

  useEffect(() => { setHomeLayoutState(personId ? resolveHomeLayout(personId) : 'focused') }, [personId])
  useEffect(() => {
    let active = true
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      const providers = Array.isArray(user?.app_metadata.providers)
        ? user.app_metadata.providers as string[]
        : user?.identities?.map((identity) => identity.provider) ?? []
      setGoogleOnly(providers.includes('google') && !providers.includes('email'))
    }).catch(() => {})
    return () => { active = false }
  }, [])

  async function handleLocaleChange(next: Locale) {
    if (next === locale) return
    setSavingLocale(true)
    setLocaleSaveFailed(false)
    setLocaleSaved(false)
    try { await accountLocale.save(next); setLocaleSaved(true) } catch { setLocaleSaveFailed(true) } finally { setSavingLocale(false) }
  }
  function handleHomeLayoutChange(next: HomeLayout) {
    setHomeLayoutState(next)
    if (personId) setHomeLayout(personId, next)
    setLayoutSaved(true)
  }
  async function handlePasswordChange(password: string, nonce?: string) {
    const { error } = await supabase.auth.updateUser({ password, ...(nonce ? { nonce } : {}) })
    if (error?.code === 'reauthentication_needed' && !nonce) return REAUTHENTICATION_REQUIRED
    return error ? t(passwordRefusal(error)) : null
  }

  return (
    <PageFamilyFrame family="management" title={t('dest.profile')} jobSentence={t('job.profile')}>
      <div className="profile-page">
        <ProfileSectionNav />
        <OfflineNotice />
        {viewer && <section className="profile-page__identity" aria-label={t('profile.identity')}>
          <dl>
            <div><dt>{t('profile.person')}</dt><dd>{viewer.person.full_name}</dd></div>
            <div><dt>{t('profile.position')}</dt><dd>{viewer.roles.map((r) => r.name).join(' · ') || '—'}</dd></div>
          </dl>
          <p className="profile-page__managed">{t('profile.managedByAdmin')}</p>
        </section>}

        <div className="profile-layout">
          <div className="profile-preferences">
            <section className="profile-section" aria-labelledby="profile-preferences-heading">
              <h2 id="profile-preferences-heading">{t('locale.toggle.label')}</h2>
            <div className="profile-row">
              <Select id="profile-language" value={locale} disabled={savingLocale || offline || accountLocale.status === 'loading'} error={localeSaveFailed}
                aria-labelledby="profile-preferences-heading" aria-describedby={localeSaveFailed ? 'profile-language-error' : undefined}
                onChange={(e) => void handleLocaleChange(e.target.value as Locale)}>
                <option value="en">{t('locale.en')}</option><option value="id">{t('locale.id')}</option>
              </Select>
              {/* One save model for the page: each choice saves as it is made, and says so beside it. */}
              {savingLocale && <span className="profile-row__status" role="status">{t('admin.row.saving')}</span>}
              {!savingLocale && localeSaved && !localeSaveFailed && <span className="profile-row__status" role="status">{t('admin.row.saved')}</span>}
            </div>
            {localeSaveFailed && <Notice tone="urgent" id="profile-language-error" className="profile-row__notice">{t('locale.saveFailed')}</Notice>}
            {!localeSaveFailed && accountLocale.status === 'unavailable' && <Notice tone="attention" className="profile-row__notice">{t('locale.loadFailed')}</Notice>}
          </section>

            {viewer && <section className="profile-section profile-home-layout" aria-labelledby="profile-home-heading">
              <h2 id="profile-home-heading">{t('profile.homeLayout')}</h2>
              <HomeLayoutPicker value={homeLayout} onChange={handleHomeLayoutChange} />
              {layoutSaved && <p className="profile-row__status" role="status">{t('admin.row.saved')}</p>}
            </section>}
          </div>

          {viewer && <section className="profile-section profile-preferences__security" aria-labelledby="profile-security-heading">
            <h2 id="profile-security-heading">{t('profile.security')}</h2>
            <div className="profile-row">
              <div className="profile-row__copy"><strong className="profile-row__title">{t(googleOnly ? 'profile.password.setTitle' : 'profile.password.title')}</strong>
                <p>{t(googleOnly ? 'profile.password.googleSubtitle' : 'profile.password.subtitle')}</p>
                {offline && !passwordOpen && <p role="status">{t('common.offline.reconnect')}</p>}</div>
              {passwordOpen
                ? <Button variant="outline" onClick={() => setPasswordOpen(false)}>{t('common.cancel')}</Button>
                : <button type="button" className="btn btn-outline" disabled={offline} onClick={() => setPasswordOpen(true)}>
                  {t(googleOnly ? 'profile.password.setTitle' : 'profile.password.change')}
                </button>}
            </div>
            {passwordOpen && <div className="profile-password" onKeyDown={(event) => { if (event.key === 'Escape') setPasswordOpen(false) }}>
              <RouteLeaveGuard when={passwordDirty} message={t('profile.password.leaveMessage')} />
              <SetPasswordForm
              onDirtyChange={setPasswordDirty}
              onSubmit={handlePasswordChange}
              onReauthenticationRequired={async () => { const { error } = await supabase.auth.reauthenticate(); return error ? t(passwordRefusal(error)) : null }}
              successMessage={t('profile.password.success')}
            /></div>}
            <div className="profile-row">
              <div className="profile-row__copy"><strong className="profile-row__title">{t('agentConnections.self.title')}</strong><p>{t('agentConnections.self.profileCopy')}</p></div>
              <Link to="/profile/connected-agents" className="btn btn-outline">{t('agentConnections.self.manage')}</Link>
            </div>
          </section>}
        </div>
      </div>
    </PageFamilyFrame>
  )
}
