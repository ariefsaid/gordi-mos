/**
 * ProfilePage — Personal Profile (OD-REDESIGN-70, owner 2026-07-18: "place the language
 * settings in the personal profile as selection"). Replaces the SliceStubPage stub.
 *
 * Grammar follows the e7 profile mockup (`e7-views.js` renderProfile): stacked cards —
 * Identity (read-only Person/Role, "managed by Admin") then settings. v1 ships the two
 * cards we have real state for: Identity + Language (the ADR-0021 locale seam, moved here
 * from the rail footer — the rail is navigation, not settings). Home-order and
 * notification cards land with their own slices (OD-18/26 profile store).
 */
import { useAuth } from '@/auth/use-auth'
import { useI18n } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Select } from '@/components/ui/select'
import { PageFamilyFrame } from '@/shell/page-family-frame'

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="bg-card border border-border"
      style={{ borderRadius: 'var(--radius-lg)', padding: 16, maxWidth: 560 }}
    >
      <h2 className="text-foreground font-semibold" style={{ fontSize: 'var(--font-size-body-lg)', margin: '0 0 12px' }}>{title}</h2>
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
      <dt className="text-muted-foreground font-medium" style={{ fontSize: 'var(--font-size-label)', marginBottom: 2 }}>{term}</dt>
      <dd className="text-foreground" style={{ fontSize: 'var(--font-size-body)', margin: 0 }}>{value}</dd>
    </div>
  )
}

export function ProfilePage() {
  const t = useT()
  const auth = useAuth()
  const { locale, setLocale } = useI18n()
  useDocumentTitle(`${t('dest.profile')} — Gordi MOS`)

  const viewer = auth.status === 'authenticated' ? auth.viewer : null

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
      </div>
    </PageFamilyFrame>
  )
}
