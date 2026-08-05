/**
 * ProfilePage — Personal Profile.
 *
 * Stacked cards: Identity (read-only Person/Role, "managed by Admin") then the settings the
 * viewer actually owns.
 *
 * **The locale control lives HERE, and that is load-bearing rather than cosmetic.** It used to
 * sit in the shell's account menu; the redesign moved it onto this page. On this branch the shell
 * no longer mounts it and this page did not exist yet, so the Indonesian UI had no reachable
 * control at all — the catalog was complete and unreachable. Landing this page is what restores
 * it. (`LocaleToggle` is deleted in the same change; leaving an unmounted duplicate control in
 * the shell is how a second, divergent language switch gets re-mounted later by mistake.)
 *
 * Identity is read-only by design: person and role records are Admin-owned, and an editable-
 * looking field that silently cannot be saved is worse than a plain labelled value.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useI18n } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Select } from '@/components/ui/select'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { HomeLayoutPicker } from '@/components/home/home-layout-picker'
import { resolveHomeLayout, setHomeLayout, type HomeLayout } from '@/lib/home-layout'

// A profile card is sized by what it hosts, and there are two kinds here.
// FORM_MEASURE — short labelled fields (Identity, Language): a form column, deliberately narrow.
// PICKER_MEASURE — the width the three-up wireframe chooser is drawn at. At FORM_MEASURE its
// cards measured 167px and the thumbnails stopped being readable, which is the entire point of a
// diagram-based chooser. Both are the card's OUTER width, so the picker's adds back the padding +
// border that the bare 720px content box does not carry.
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
      {/* Section/card title = --font-size-heading (20px) per DESIGN.md Typography Hierarchy
          ("Heading … Section/card titles"). Not body-lg (15px) — that token is reserved for
          record titles and row text, not card headers. */}
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

export function ProfilePage() {
  const t = useT()
  const auth = useAuth()
  const { locale, setLocale } = useI18n()
  useDocumentTitle(t('common.docTitle', { page: t('dest.profile') }))

  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const personId = viewer?.person.id ?? null

  const [homeLayout, setHomeLayoutState] = useState<HomeLayout>('focused')
  useEffect(() => {
    if (personId) setHomeLayoutState(resolveHomeLayout(personId))
  }, [personId])

  function handleHomeLayoutChange(next: HomeLayout) {
    setHomeLayoutState(next)
    if (personId) setHomeLayout(personId, next)
  }

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
                <ReadonlyRow
                  // The domain permits several roles and real viewers are dual-hatted, so the
                  // term agrees with the value: "Roles" when there is more than one.
                  term={viewer.roles.length > 1 ? t('profile.roles') : t('profile.role')}
                  value={viewer.roles.map((r) => r.name).join(' · ') || '—'}
                />
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

        <ProfileCard title={t('profile.homeLayout')} maxWidth={PICKER_MEASURE}>
          <HomeLayoutPicker value={homeLayout} onChange={handleHomeLayoutChange} />
        </ProfileCard>
      </div>
    </PageFamilyFrame>
  )
}
