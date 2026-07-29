/**
 * ProfilePage — Personal Profile (OD-REDESIGN-70, owner 2026-07-18: "place the language
 * settings in the personal profile as selection"). Replaces the SliceStubPage stub.
 *
 * Grammar follows the e7 profile mockup (`e7-views.js` renderProfile): stacked cards —
 * Identity (read-only Person/Role, "managed by Admin") then settings. Ships Identity +
 * Language (the ADR-0021 locale seam, moved here from the rail footer). The Home order
 * preference (OD-18) was retired (OD-V4-10) in favour of a Home layout preference
 * (OD-V4-9). Notification prefs land with their own slice (OD-26 profile store).
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
// PICKER_MEASURE — the mockup's `#profile .setting { max-width: 720px }`, the width the
// three-up wireframe chooser was drawn at. At FORM_MEASURE its cards measured 167px and the
// thumbnails stopped being readable, which is the entire point of a diagram-based chooser.
// Both are the card's OUTER width, so the picker's adds back the padding + border the mockup's
// bare container did not carry.
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
    // Soft-Elevation Rule (DESIGN.md OD-P3-11): cards carry the border AND the resting
    // shadow — matches AuthCard / KPITile, the app's other bordered-card instances.
    <section
      className="bg-card border border-border"
      style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-rest)', padding: CARD_PADDING, maxWidth }}
    >
      {/* Section/card title = --font-size-heading (20px) per DESIGN.md Typography
          Hierarchy ("Heading … Section/card titles") — was body-lg (15px), the token
          DESIGN.md reserves for record titles/row text, not card headers. */}
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

// Read-only identity reads as plain labelled text, never an editable/input-styled field
// (profile polish): a <dl> of quiet term/value rows, not form controls.
function ReadonlyRow({ term, value }: { term: string; value: string }) {
  return (
    <div>
      {/* xs (4px) on the documented spacing scale (DESIGN.md) — was an off-scale 2px. */}
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
    // V3 Management family (Issue 11): the shared frame owns the h1 + job sentence
    // (audit F7 — no bespoke <h1>). Identity + Language cards are the typed body.
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
          {/* The card heading is the visible "Language" label; the select keeps its accessible
              name via an sr-only label so there is no duplicate visible field label. */}
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
