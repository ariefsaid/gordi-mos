export const BASE_PATH_ENV = 'VITE_BASE_PATH'
export const DEFAULT_BASE_PATH = '/'
export const RELEASE_PROFILE_ENV = 'VITE_RELEASE_PROFILE'
export const DEFAULT_RELEASE_PROFILE: ReleaseProfile = 'full'

export type ReleaseProfile = 'full' | 'cafe'
export type ProfileFeature = 'workCollections' | 'deputy'

const CAFE_PROFILE_BLOCKED_PATHS = ['/work', '/tasks', '/updates', '/objectives', '/projects-processes'] as const

const LEGACY_CAFE_DESTINATIONS: Readonly<Record<string, string>> = {
  '/kitchen': '/cafe',
  '/kitchen/log': '/cafe',
  '/kitchen/plan': '/cafe/plan',
  '/kitchen/stock': '/cafe/stock',
  '/kitchen/review': '/cafe/review',
  '/kitchen/pushes': '/cafe/pushes',
  '/cafe/log': '/cafe',
}

const CAFE_REDIRECTS = Object.entries(LEGACY_CAFE_DESTINATIONS)

export type BuildEnvironment = Readonly<Record<string, string | undefined>>

export function normalizeBasePath(value: string | undefined = DEFAULT_BASE_PATH): string {
  const path = value?.trim() || DEFAULT_BASE_PATH
  if (path === '/') return path
  if (!path.startsWith('/') || path.includes('//') || /[?#\\\s]/.test(path)) {
    throw new Error(`${BASE_PATH_ENV} must be a root-relative path without query or fragment`)
  }
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`${BASE_PATH_ENV} must not contain dot segments`)
  }
  return `/${segments.join('/')}/`
}

export function resolveBuildSettings(env: BuildEnvironment): { basePath: string; profile: ReleaseProfile } {
  const profile = env[RELEASE_PROFILE_ENV]?.trim() || DEFAULT_RELEASE_PROFILE
  if (profile !== 'full' && profile !== 'cafe') {
    throw new Error(`${RELEASE_PROFILE_ENV} must be "full" or "cafe"`)
  }
  return { basePath: normalizeBasePath(env[BASE_PATH_ENV]), profile }
}

/** Work collections are outside the Café payload, while shared support and Café routes remain. */
export function isProfilePathAvailable(path: string, profile: ReleaseProfile): boolean {
  const pathname = path.split('#')[0].split('?')[0]
  return profile === 'full' || (pathname !== '/' && !CAFE_PROFILE_BLOCKED_PATHS.some(
    (blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`),
  ))
}

/**
 * Work collections and Deputy are UI capabilities, not authorization roles. The Cafe release
 * omits both while leaving Task/Process services available to the Café workflows that need them.
 */
export function isProfileFeatureAvailable(_feature: ProfileFeature, profile: ReleaseProfile): boolean {
  return profile === 'full'
}

export function profileLandingPath(profile: ReleaseProfile): string {
  return profile === 'cafe' ? '/cafe' : '/'
}

export function routerBasename(basePath: string): string {
  const normalized = normalizeBasePath(basePath)
  return normalized === '/' ? '/' : normalized.slice(0, -1)
}

export function appPath(path: string, basePath: string): string {
  const normalized = normalizeBasePath(basePath)
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('App routes must be root-relative paths')
  }
  const route = path.slice(1)
  return route ? `${normalized}${route}` : normalized
}

export function stripBasePath(pathname: string, basePath: string): string {
  const base = normalizeBasePath(basePath)
  if (base === '/') return pathname || '/'
  const bareBase = base.slice(0, -1)
  if (pathname === bareBase || pathname === base) return '/'
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname
}

export function legacyRedirectDestination(pathname: string, search: string, basePath: string): string | null {
  const normalizedBase = normalizeBasePath(basePath)
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const hasMosPrefix = path === '/mos' || path.startsWith('/mos/')
  const routePath = hasMosPrefix ? path.slice('/mos'.length) || '/' : path
  const cafeDestination = LEGACY_CAFE_DESTINATIONS[routePath]
  const isKitchenRoute = routePath === '/kitchen' || routePath.startsWith('/kitchen/')
  if (!hasMosPrefix && !isKitchenRoute) return null
  if (hasMosPrefix && normalizedBase === '/mos/' && cafeDestination === undefined && !isKitchenRoute) return null

  const destinationPath = cafeDestination ?? (isKitchenRoute ? `/cafe${routePath.slice('/kitchen'.length)}` : routePath)
  const destination = `${appPath(destinationPath, normalizedBase)}${search}`
  return destination === `${pathname}${search}` ? null : destination
}

export function appManifest(basePath: string): string {
  const base = normalizeBasePath(basePath)
  return JSON.stringify({
    name: 'Gordi MOS',
    short_name: 'MOS',
    description: 'Gordi management operating system',
    start_url: base,
    scope: base,
    display: 'standalone',
    // Web App Manifest colors are required literal values, not CSS declarations.
    // eslint-disable-next-line no-restricted-syntax -- manifest color metadata requires literals.
    background_color: '#ffffff',
    // eslint-disable-next-line no-restricted-syntax -- manifest color metadata requires literals.
    theme_color: '#111827',
    icons: [],
  }, null, 2)
}

export function cloudflareRedirects(basePath: string): string {
  const base = normalizeBasePath(basePath)
  const lines: string[] = []
  const addLegacyRedirect = (source: string, destination: string) => {
    lines.push(`${source} ${appPath(destination, base)} 301`)
  }

  if (base !== '/') {
    const baseWithoutSlash = base.slice(0, -1)
    lines.push(`/ ${base} 302`, `${baseWithoutSlash} ${base} 302`)
    lines.push(
      `${base}sw.js /sw.js 200`,
      `${base}manifest.webmanifest /manifest.webmanifest 200`,
      `${base}offline.html /offline 200`,
      `${base}assets/* /assets/:splat 200`,
    )
  } else {
    lines.push('/offline.html /offline 200')
  }

  if (base !== '/mos/') {
    addLegacyRedirect('/mos', '/')
    addLegacyRedirect('/mos/', '/')
  }
  for (const [source, destination] of CAFE_REDIRECTS) {
    addLegacyRedirect(`/mos${source}`, destination)
    addLegacyRedirect(`/mos${source}/`, destination)
    addLegacyRedirect(source, destination)
    addLegacyRedirect(`${source}/`, destination)
  }
  lines.push(`/mos/kitchen/* ${appPath('/cafe/:splat', base)} 301`)
  lines.push(`/kitchen/* ${appPath('/cafe/:splat', base)} 301`)
  if (base !== '/mos/') lines.push(`/mos/* ${appPath('/:splat', base)} 301`)

  return `${lines.join('\n')}\n`
}
