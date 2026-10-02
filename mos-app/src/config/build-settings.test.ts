import { describe, expect, it } from 'vitest'
import {
  BASE_PATH_ENV,
  DEFAULT_BASE_PATH,
  DEFAULT_RELEASE_PROFILE,
  RELEASE_PROFILE_ENV,
  appManifest,
  appPath,
  cloudflareRedirects,
  legacyRedirectDestination,
  isProfileFeatureAvailable,
  isProfilePathAvailable,
  normalizeBasePath,
  profileLandingPath,
  resolveBuildSettings,
  routerBasename,
  stripBasePath,
} from './build-settings'

describe('build path setting', () => {
  it('defaults to the site root and full profile, and normalizes a configured path once', () => {
    expect(DEFAULT_BASE_PATH).toBe('/')
    expect(DEFAULT_RELEASE_PROFILE).toBe('full')
    expect(RELEASE_PROFILE_ENV).toBe('VITE_RELEASE_PROFILE')
    expect(resolveBuildSettings({}).basePath).toBe('/')
    expect(resolveBuildSettings({}).profile).toBe('full')
    expect(resolveBuildSettings({ [BASE_PATH_ENV]: '/preview' }).basePath).toBe('/preview/')
    expect(resolveBuildSettings({ [BASE_PATH_ENV]: '/preview/' }).basePath).toBe('/preview/')
  })

  it('selects the cafe release profile at build time and rejects unknown profiles', () => {
    expect(resolveBuildSettings({ VITE_RELEASE_PROFILE: 'cafe' }).profile).toBe('cafe')
    expect(() => resolveBuildSettings({ VITE_RELEASE_PROFILE: 'preview' })).toThrow(/VITE_RELEASE_PROFILE/)
  })

  it('keeps only Cafe paths and support capabilities in the cafe release profile', () => {
    expect(isProfilePathAvailable('/work/tasks/task-1?view=mine', 'cafe')).toBe(false)
    expect(isProfilePathAvailable('/work/signals', 'cafe')).toBe(false)
    expect(isProfilePathAvailable('/workshop', 'cafe')).toBe(true)
    expect(isProfilePathAvailable('/', 'cafe')).toBe(false)
    for (const path of ['/cafe/production', '/cafe/transfer', '/cafe/items']) {
      expect(isProfilePathAvailable(path, 'cafe'), `${path} should ship in the cafe profile`).toBe(true)
      expect(isProfilePathAvailable(path, 'full'), `${path} should ship in the full profile`).toBe(true)
    }
    expect(isProfilePathAvailable('/cafe/plan', 'cafe')).toBe(true)
    expect(isProfilePathAvailable('/admin/people', 'cafe')).toBe(true)
    expect(isProfilePathAvailable('/work/tasks', 'full')).toBe(true)
    expect(isProfileFeatureAvailable('workCollections', 'cafe')).toBe(false)
    expect(isProfileFeatureAvailable('deputy', 'cafe')).toBe(false)
    expect(isProfileFeatureAvailable('workCollections', 'full')).toBe(true)
    expect(profileLandingPath('cafe')).toBe('/cafe')
    expect(profileLandingPath('full')).toBe('/')
  })

  it.each(['https://example.test/app/', '/app//nested/', '/app?mode=test', '/app/../other']) (
    'rejects an unsafe or malformed base path: %s',
    (path) => expect(() => normalizeBasePath(path)).toThrow(),
  )

  it('builds the installable app manifest with the configured start URL and scope', () => {
    expect(JSON.parse(appManifest('/'))).toMatchObject({ start_url: '/', scope: '/' })
    expect(JSON.parse(appManifest('/preview'))).toMatchObject({ start_url: '/preview/', scope: '/preview/' })
  })

  it('builds route URLs and router basenames from the same base path', () => {
    expect(routerBasename('/')).toBe('/')
    expect(appPath('/work/tasks?view=mine', '/')).toBe('/work/tasks?view=mine')
    expect(routerBasename('/preview/')).toBe('/preview')
    expect(appPath('/work/tasks', '/preview/')).toBe('/preview/work/tasks')
    expect(appPath('/', '/preview/')).toBe('/preview/')
    expect(stripBasePath('/preview/work/tasks', '/preview/')).toBe('/work/tasks')
    expect(stripBasePath('/preview', '/preview/')).toBe('/')
    expect(stripBasePath('/work/tasks', '/')).toBe('/work/tasks')
  })
})

describe('legacy address redirects', () => {
  it('removes the old /mos prefix and keeps the query string', () => {
    expect(legacyRedirectDestination('/mos', '?view=mine', '/')).toBe('/?view=mine')
    expect(legacyRedirectDestination('/mos/work/tasks', '?view=mine', '/')).toBe('/work/tasks?view=mine')
  })

  it('moves legacy kitchen screens directly under /cafe and keeps the query string', () => {
    expect(legacyRedirectDestination('/mos/kitchen/plan', '?week=2026-10-02', '/preview/')).toBe(
      '/preview/cafe/plan?week=2026-10-02',
    )
    expect(legacyRedirectDestination('/kitchen/pushes', '?status=failed', '/')).toBe('/cafe/pushes?status=failed')
    expect(legacyRedirectDestination('/kitchen/log', '?date=today', '/')).toBe('/cafe/production?date=today')
    expect(legacyRedirectDestination('/mos/kitchen/log', '?date=today', '/')).toBe('/cafe/production?date=today')
    expect(legacyRedirectDestination('/cafe/log', '?date=today', '/')).toBe('/cafe/production?date=today')
    expect(legacyRedirectDestination('/mos/cafe/log', '?date=today', '/')).toBe('/cafe/production?date=today')
    expect(legacyRedirectDestination('/mos/kitchen/plan', '?week=this-week', '/mos/')).toBe(
      '/mos/cafe/plan?week=this-week',
    )
  })

  it('returns no redirect for the current address, including when the configured base is /mos', () => {
    expect(legacyRedirectDestination('/work/tasks', '', '/')).toBeNull()
    expect(legacyRedirectDestination('/mos/work/tasks', '', '/mos/')).toBeNull()
  })

  it('emits Cloudflare rules for root builds and configurable sub-path builds', () => {
    const rootRules = cloudflareRedirects('/')
    expect(rootRules).toContain('/mos/* /:splat 301')
    expect(rootRules).toContain('/mos/kitchen/plan /cafe/plan 301')
    expect(rootRules).toContain('/kitchen/pushes /cafe/pushes 301')
    expect(rootRules).toContain('/kitchen/log /cafe/production 301')
    expect(rootRules).toContain('/cafe/log /cafe/production 301')
    expect(rootRules).toContain('/offline.html /offline 200')

    const subPathRules = cloudflareRedirects('/preview/')
    expect(subPathRules).toContain('/ /preview/ 302')
    expect(subPathRules).toContain('/mos/* /preview/:splat 301')
    expect(subPathRules).toContain('/mos/cafe/log /preview/cafe/production 301')
    expect(subPathRules).toContain('/kitchen/log /preview/cafe/production 301')
    expect(subPathRules).toContain('/preview/assets/* /assets/:splat 200')
    expect(subPathRules).toContain('/preview/offline.html /offline 200')
  })
})
