/**
 * ProfilePage — Personal Profile (#807, part of #738).
 *
 * Stacked cards: Identity (Person · Team · Position · Access, read-only) → Language → Password
 * → Home layout. Identity is Admin-owned, so its values render as plain labelled text (a <dl>)
 * — an editable-looking field that silently cannot be saved is worse than a plain value.
 *
 * The Password card offers the viewer's ONE self-service on this page (#131, #798): when the
 * viewer has a real email, the same `SetPasswordForm` used by the recovery/must-change flows
 * mounts inline in the card body; a sign-in-name account (synthetic address, #798) sees the
 * ask-your-admin line and no control instead. `viewer.hasEmail` is the fact — it comes off the
 * viewer payload on the base branch (#798), no re-derivation here.
 *
 * The locale control lives HERE and that is load-bearing rather than cosmetic — this page is the
 * app's only path to the Indonesian UI now that the shell no longer mounts a locale toggle.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useI18n } from '@/i18n/I18nProvider'
import type { Locale, MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Select } from '@/components/ui/select'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { HomeLayoutPicker } from '@/components/home/home-layout-picker'
import { resolveHomeLayout, setHomeLayout, type HomeLayout } from '@/lib/home-layout'
import { supabase } from '@/lib/supabase'
import { SetPasswordForm } from '@/auth/set-password-form'
import { listViewerTeams, type ViewerTeam } from '@/lib/db/viewer-teams'
import { localizedRoleMeta } from '@/lib/db/admin-users.types'

// A profile card is sized by what it hosts, and there are two kinds here.
// FORM_MEASURE — short labelled fields (Identity, Language, Password): a form column, narrow.
// PICKER_MEASURE — the width the three-up wireframe chooser is drawn at. At FORM_MEASURE its
// cards measured 167px and the thumbnails stopped being readable, which is the whole point of a
// diagram-based chooser. Both are the card's OUTER width, so the picker's adds back the padding
// + border that the bare 720px content box does not carry.
const CARD_PADDING = 16
const CARD_BORDER = 1
const FORM_MEASURE = 560
const PICKER_MEASURE = 720 + 2 * (CARD_PADDING + CARD_BORDER)

function ProfileCard({
  title,
  children,
  maxWidth = FORM_MEASURE,
}: {
  title: string
  children: React.ReactNode
  maxWidth?: number
}) {
  return (
    // Soft-Elevation Rule (DESIGN.md OD-P3-11): cards carry the border AND the resting shadow —
    // matches AuthCard / KPITile, the app's other bordered-card instances.
    <section
      className="bg-card border border-border"
      style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-rest)', padding: CARD_PADDING, maxWidth }}
    >
      <h2 className="text-foreground font-semibold" style={{ fontSize: 'var(--font-size-heading)', lineHeight: 1.25, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  )
}

function FieldLabel({ htmlFor, children, srOnly }: { htmlFor: string; children: React.ReactNode; srOnly?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      className={srOnly ? 'sr-only' : 'block text-muted-foreground font-medium'}
      style={srOnly ? undefined : { fontSize: 'var(--font-size-label)', marginBottom: 4 }}
    >
      {children}
    </label>
  )
}

// Read-only identity reads as plain labelled text, never an editable/input-styled field: a <dl>
// of quiet term/value rows, not form controls.
function ReadonlyRow({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground font-medium" style={{ fontSize: 'var(--font-size-label)', marginBottom: 4 }}>{term}</dt>
      <dd className="text-foreground" style={{ fontSize: 'var(--font-size-body)', margin: 0 }}>{value}</dd>
    </div>
  )
}

const DASH = '—'
const SEP = ' · '

export function ProfilePage() {
  const t = useT()
  const auth = useAuth()
  const { locale, setLocale } = useI18n()
  useDocumentTitle(t('common.docTitle', { page: t('dest.profile') }))

  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const personId = viewer?.person.id ?? null
  const hasEmail = viewer?.hasEmail ?? false

  const [homeLayout, setHomeLayoutState] = useState<HomeLayout>('focused')
  useEffect(() => {
    if (personId) setHomeLayoutState(resolveHomeLayout(personId))
  }, [personId])

  // Viewer teams — read once per authenticated mount. RLS scopes the row set; there is no admin
  // path on this page. Absence, a failing read, and one/many teams all render sensibly (see
  // the Teams row build below).
  const [teams, setTeams] = useState<ViewerTeam[] | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!personId) { setTeams(null); return }
    listViewerTeams(personId)
      .then((rows) => { if (!cancelled) setTeams(rows) })
      .catch((err) => { console.warn('profile: viewer teams read failed', err); if (!cancelled) setTeams([]) })
    return () => { cancelled = true }
  }, [personId])

  const [changingPassword, setChangingPassword] = useState(false)
  async function handlePasswordSubmit(password: string): Promise<string | null> {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      if (error.code === 'weak_password') return error.message
      return "Couldn't set that password — try again."
    }
    setChangingPassword(false)
    return null
  }

  function handleHomeLayoutChange(next: HomeLayout) {
    setHomeLayoutState(next)
    if (personId) setHomeLayout(personId, next)
  }

  // Positions row: term agrees with the value ("Positions" when there are more than one).
  const positionNames = viewer?.roles.map((r) => r.name) ?? []
  const positionValue = positionNames.length > 0 ? positionNames.join(SEP) : DASH
  const positionTerm = positionNames.length > 1 ? t('profile.positions') : t('profile.position')

  // Team row: primary first (already ordered by listViewerTeams), then the rest.
  const teamNames = teams?.map((row) => row.name) ?? []
  const teamValue = teamNames.length > 0 ? teamNames.join(SEP) : DASH
  const teamTerm = teamNames.length > 1 ? t('profile.teams') : t('profile.team')

  // Access row: JWT-stored access-role slugs → localized labels. Reporting-line manager is a
  // DERIVED fact, not a stored grant, and is deliberately omitted here (see viewer.ts).
  const accessRoles = viewer?.accessRoles ?? []
  const accessValue = accessRoles.length > 0
    ? accessRoles.map((slug) => localizedRoleMeta(slug, (k, v) => t(k as MessageKey, v)).label).join(SEP)
    : DASH

  return (
    // Management family: the shared frame owns the h1 + job sentence (no bespoke <h1> here).
    <PageFamilyFrame
      family="management"
      title={t('dest.profile')}
      jobSentence={t('job.profile')}
    >
      <div className="flex flex-col" style={{ gap: 16 }}>
        {viewer && (
          <ProfileCard title={t('profile.identity')}>
            <div className="flex flex-col" style={{ gap: 12 }}>
              <dl className="flex flex-col" style={{ gap: 12, margin: 0 }}>
                <ReadonlyRow term={t('profile.person')} value={viewer.person.full_name} />
                <ReadonlyRow term={teamTerm} value={teamValue} />
                <ReadonlyRow term={positionTerm} value={positionValue} />
                <ReadonlyRow term={t('profile.accessLevel')} value={accessValue} />
              </dl>
              <p className="text-muted-foreground" style={{ fontSize: 'var(--font-size-label)', margin: 0 }}>
                {t('profile.managedByAdmin')}
              </p>
            </div>
          </ProfileCard>
        )}

        <ProfileCard title={t('locale.toggle.label')}>
          {/* The card heading IS the visible "Language" label; the select keeps its accessible
              name via an sr-only label, so there is no duplicate visible field label. */}
          <FieldLabel htmlFor="profile-language" srOnly>{t('locale.toggle.label')}</FieldLabel>
          <Select
            id="profile-language"
            fullWidth
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="en">{t('locale.en')}</option>
            <option value="id">{t('locale.id')}</option>
          </Select>
        </ProfileCard>

        {viewer && (
          <ProfileCard title={t('profile.password')}>
            {hasEmail ? (
              changingPassword ? (
                <SetPasswordForm
                  title={t('profile.password.change')}
                  subtitle={t('profile.password.subtitle')}
                  onSubmit={handlePasswordSubmit}
                  mode="inline"
                  footer={(busy) => (
                    <div className="flex justify-center" style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        disabled={busy}
                        className="text-primary font-medium rounded-sm px-3 hover:underline focus-visible:underline"
                        style={{ height: 32, fontSize: 16, opacity: busy ? 0.5 : 1 }}
                        onClick={() => setChangingPassword(false)}
                      >
                        {t('profile.password.cancel')}
                      </button>
                    </div>
                  )}
                />
              ) : (
                <div className="flex flex-col" style={{ gap: 12 }}>
                  <p className="text-muted-foreground" style={{ fontSize: 'var(--font-size-label)', margin: 0 }}>
                    {t('profile.password.help')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setChangingPassword(true)}
                    className="bg-primary text-primary-foreground rounded-sm font-medium"
                    style={{ height: 32, fontSize: 16, alignSelf: 'flex-start', padding: '0 12px' }}
                  >
                    {t('profile.password.change')}
                  </button>
                </div>
              )
            ) : (
              <p className="text-muted-foreground" style={{ fontSize: 'var(--font-size-body)', margin: 0 }}>
                {t('profile.password.askAdmin')}
              </p>
            )}
          </ProfileCard>
        )}

        <ProfileCard title={t('profile.homeLayout')} maxWidth={PICKER_MEASURE}>
          <HomeLayoutPicker value={homeLayout} onChange={handleHomeLayoutChange} />
        </ProfileCard>
      </div>
    </PageFamilyFrame>
  )
}
