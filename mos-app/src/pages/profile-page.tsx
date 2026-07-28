/**
 * ProfilePage — Personal Profile (OD-REDESIGN-70, owner 2026-07-18: "place the language
 * settings in the personal profile as selection"). Replaces the SliceStubPage stub.
 *
 * Grammar follows the e7 profile mockup (`e7-views.js` renderProfile): stacked cards —
 * Identity (read-only Person/Role, "managed by Admin") then settings. Ships Identity +
 * Language (the ADR-0021 locale seam, moved here from the rail footer) + Home order
 * (OD-REDESIGN-18 completion, 2026-07-27: the order-preference control moved out of
 * Home's head action slot into its OWN settings home here — Home only ever owed the
 * required "Needs attention · N" summary, not the control that sets the preference).
 * Notification prefs land with their own slice (OD-26 profile store).
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useI18n } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Select } from '@/components/ui/select'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { HomeOrderToggle } from '@/components/home/home-order-toggle'
import { resolveRegionOrder, setRegionOrder, type HomeRegionOrder } from '@/lib/home-region-order'

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // Soft-Elevation Rule (DESIGN.md OD-P3-11): cards carry the border AND the resting
    // shadow — matches AuthCard / KPITile, the app's other bordered-card instances.
    <section
      className="bg-card border border-border"
      style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-rest)', padding: 16, maxWidth: 560 }}
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

  // ── Home order (OD-REDESIGN-18) — per-user, default attention-first. Read on mount/personId
  // change so a full reload (and a fresh session for a different person) always resolves the
  // real stored value rather than the attention-first default flashing first. ──
  const [homeOrder, setHomeOrder] = useState<HomeRegionOrder>('attention-first')
  useEffect(() => {
    if (personId) setHomeOrder(resolveRegionOrder(personId))
  }, [personId])

  function handleHomeOrderChange(next: HomeRegionOrder) {
    setHomeOrder(next)
    if (personId) setRegionOrder(personId, next)
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

        {viewer && (
          <ProfileCard title={t('home.order.toggle')}>
            {/* Same radiogroup (RI-1) and classnames Home used to render inline in its head
                action slot (OD-REDESIGN-18) — only the host moved. The card heading already
                reads as the control's label, so the radiogroup's own aria-label carries the
                accessible name without a duplicate visible field label. */}
            <HomeOrderToggle order={homeOrder} onChange={handleHomeOrderChange} label={t('home.order.toggle')} />
          </ProfileCard>
        )}
      </div>
    </PageFamilyFrame>
  )
}
