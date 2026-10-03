import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useIsNarrow } from './use-is-narrow'
import { DESTINATIONS } from './destinations'
import { visibleSections } from './sections'
import './work-collection-switcher.css'

/**
 * Narrow-layout sibling navigation for the four Work collections. The list and order come from the
 * same Work-child registry as the rail and More drawer, and the rail's visibility gate is reused so
 * the switcher cannot offer a destination the viewer is not allowed to reach.
 */
export function WorkCollectionSwitcher() {
  const { pathname } = useLocation()
  const isNarrow = useIsNarrow()
  const auth = useAuth()
  const t = useT()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const work = DESTINATIONS.find((destination) => destination.id === 'work')
  const collections = visibleSections(work?.children ?? [], accessRoles)

  // Keep canonical record pages uncluttered: their shared record chrome owns the one Back door.
  if (!isNarrow || !collections.some((collection) => collection.path === pathname)) return null

  return (
    <nav
      aria-label={t('dest.work')}
      className="work-collection-switcher"
      data-anatomy="work-collection-switcher"
    >
      <ul className="work-collection-switcher__list">
        {collections.map((collection) => {
          const current = collection.path === pathname
          return (
            <li key={collection.path} className="work-collection-switcher__item">
              <Link
                to={collection.path}
                aria-current={current ? 'location' : undefined}
                className="work-collection-switcher__link"
              >
                {collection.labelKey ? t(collection.labelKey) : collection.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
