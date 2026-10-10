import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useIsNarrow } from './use-is-narrow'
import { DESTINATIONS, MODULES } from './destinations'
import { visibleSections } from './sections'
import './work-collection-switcher.css'

/**
 * Narrow-layout sibling navigation for Work collections and high-frequency Café destinations.
 * Both lists come from the same registry and visibility gate as the rail and More drawer.
 */
export function WorkCollectionSwitcher() {
  const { pathname } = useLocation()
  const isNarrow = useIsNarrow()
  const auth = useAuth()
  const t = useT()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const work = DESTINATIONS.find((destination) => destination.id === 'work')
  const cafe = MODULES.flatMap((group) => group.items).find((module) => module.id === 'cafe')
  const workCollections = visibleSections(work?.children ?? [], accessRoles)
  const cafeRoute = pathname === '/cafe' || pathname.startsWith('/cafe/')
  const cafeShortcuts = visibleSections(cafe?.children ?? [], accessRoles).filter(({ path }) =>
    ['/cafe/count', '/cafe/receive', '/cafe/plan', '/cafe/stock'].includes(path),
  )
  const collections = cafeRoute ? cafeShortcuts : workCollections

  // Keep canonical Work record pages uncluttered; Café shortcuts stay available across its routes.
  if (!isNarrow || (!cafeRoute && !workCollections.some((collection) => collection.path === pathname))) return null

  return (
    <nav
      aria-label={t(cafeRoute ? 'dest.cafe' : 'dest.work')}
      className="work-collection-switcher"
      data-anatomy="work-collection-switcher"
    >
      <ul className="work-collection-switcher__list">
        {collections.map((collection) => {
          const current = pathname === collection.path || pathname.startsWith(`${collection.path}/`)
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
