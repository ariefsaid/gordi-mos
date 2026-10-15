import { useLocation, useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { ViewTabs } from '@/components/ui/view-tabs'
import './profile-section-nav.css'

/** The two views of the personal area, as the shared tab strip (each tab is its own route). */
export function ProfileSectionNav() {
  const t = useT()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = pathname.startsWith('/profile/connected-agents') ? 'agents' : 'profile'
  return (
    <div className="profile-section-nav">
      <ViewTabs
        ariaLabel={t('dest.profile')}
        active={active}
        onChange={(id) => navigate(id === 'agents' ? '/profile/connected-agents' : '/profile')}
        tabs={[
          { id: 'profile', label: t('dest.profile') },
          { id: 'agents', label: t('agentConnections.self.title') },
        ]}
      />
    </div>
  )
}
