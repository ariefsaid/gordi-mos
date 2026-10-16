import { useT } from '@/i18n/use-t'
import { useLocation, useNavigate } from 'react-router-dom'
import type { MessageKey } from '@/i18n/messages'
import { Select } from '@/components/ui/select'
import { isShipGated } from '@/lib/ship-gate'
import './admin-settings.css'

const SECTIONS: { to: string; labelKey: MessageKey }[] = [
  { to: '/admin/people', labelKey: 'admin.settings.nav.people' },
  { to: '/admin/teams', labelKey: 'admin.settings.nav.teams' },
  { to: '/admin/access', labelKey: 'admin.settings.nav.access' },
  { to: '/admin/modules', labelKey: 'admin.settings.nav.modules' },
  { to: '/admin/agents', labelKey: 'admin.settings.nav.agents' },
]

/** Phone section switcher; desktop navigation lives in the grouped Admin rail. */
export function AdminSettingsNav() {
  const t = useT()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Preview ship state: a section is offered only where its route exists (Modules, until it ships).
  const sections = SECTIONS.filter((section) => !isShipGated(section.to))
  const active = sections.find((section) => pathname === section.to || pathname.startsWith(`${section.to}/`)) ?? sections[0]

  return (
    <nav className="admin-settings-nav" aria-label={t('admin.settings.nav.aria')}>
      <Select
        id="admin-section-select"
        className="admin-settings-nav__select"
        label={t('dest.admin')}
        value={active.to}
        onChange={(event) => navigate(event.target.value)}
        fullWidth
      >
        {sections.map((section) => (
          <option key={section.to} value={section.to}>{t(section.labelKey)}</option>
        ))}
      </Select>
    </nav>
  )
}
