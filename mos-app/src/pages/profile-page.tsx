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
import { PageFrame } from '@/shell/page-frame'

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="bg-card border border-border"
      style={{ borderRadius: 'var(--radius-sm)', padding: 16, maxWidth: 560 }}
    >
      <h2 className="attention-brief-title" style={{ marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  )
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-muted-foreground font-medium"
      style={{ fontSize: 12, marginBottom: 4 }}
    >
      {children}
    </label>
  )
}

const fieldClass =
  'w-full bg-secondary border border-border text-foreground px-3'

export function ProfilePage() {
  const t = useT()
  const auth = useAuth()
  const { locale, setLocale } = useI18n()
  useDocumentTitle(`${t('dest.profile')} — Gordi MOS`)

  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  return (
    <PageFrame>
      <h1 className="font-semibold text-foreground" style={{ fontSize: 26 }}>{t('dest.profile')}</h1>
      <p className="text-muted-foreground" style={{ marginTop: 8, marginBottom: 20 }}>
        <b>{t('job.profile')}</b>
      </p>

      <div className="flex flex-col" style={{ gap: 16 }}>
        {viewer && (
          <ProfileCard title={t('profile.identity')}>
            <div className="flex flex-col" style={{ gap: 12 }}>
              <div>
                <FieldLabel htmlFor="profile-person">{t('profile.person')}</FieldLabel>
                <input
                  id="profile-person"
                  className={fieldClass}
                  style={{ height: 34, borderRadius: 'var(--radius-sm)', fontSize: 14 }}
                  value={viewer.person.full_name}
                  readOnly
                />
              </div>
              <div>
                <FieldLabel htmlFor="profile-role">{t('profile.role')}</FieldLabel>
                <input
                  id="profile-role"
                  className={fieldClass}
                  style={{ height: 34, borderRadius: 'var(--radius-sm)', fontSize: 14 }}
                  value={viewer.roles[0]?.name ?? '—'}
                  readOnly
                />
              </div>
              <p className="text-muted-foreground" style={{ fontSize: 12, margin: 0 }}>
                {t('profile.managedByAdmin')}
              </p>
            </div>
          </ProfileCard>
        )}

        <ProfileCard title={t('locale.toggle.label')}>
          <FieldLabel htmlFor="profile-language">{t('locale.toggle.label')}</FieldLabel>
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
    </PageFrame>
  )
}
