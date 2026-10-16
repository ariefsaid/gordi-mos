import { describe, expect, it } from 'vitest'
import {
  isPreviewAllowed, isShipGated, isShipGatedInProfile, previewAllowedFor, shipStateInProfile, type PreviewFacts,
} from './ship-gate'

const LOCAL: PreviewFacts = { dev: true, mode: 'development', flag: '1', hostname: '127.0.0.1', port: '4400' }

describe('preview is allowed only on a flagged dev server at localhost:4400', () => {
  it('allows the explicit local launch on each loopback host', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) expect(previewAllowedFor({ ...LOCAL, hostname })).toBe(true)
  })

  it.each([
    ['a production build', { dev: false }],
    ['a non-development mode', { mode: 'production' }],
    ['a test mode', { mode: 'test' }],
    ['no flag', { flag: undefined }],
    ['a flag that is not exactly 1', { flag: 'true' }],
    ['a remote host', { hostname: 'mos.example.com' }],
    ['a LAN address', { hostname: '192.168.1.20' }],
    ['another port', { port: '4401' }],
    ['no port (default 80/443)', { port: '' }],
    ['no browser', { hostname: undefined, port: undefined }],
  ] as [string, Partial<PreviewFacts>][])('refuses %s', (_name, change) => {
    expect(previewAllowedFor({ ...LOCAL, ...change })).toBe(false)
  })

  it('takes a side-server port only from the launch, still local and flagged', () => {
    expect(previewAllowedFor({ ...LOCAL, port: '4419', allowedPort: '4419' })).toBe(true)
    expect(previewAllowedFor({ ...LOCAL, port: '4419' })).toBe(false)
    expect(previewAllowedFor({ ...LOCAL, port: '4419', allowedPort: '4419', flag: undefined })).toBe(false)
    expect(previewAllowedFor({ ...LOCAL, port: '4419', allowedPort: '4419', hostname: 'example.com' })).toBe(false)
  })

  it('is false in the test run (not a development-mode launch)', () => {
    expect(isPreviewAllowed()).toBe(false)
  })
})

describe('ship states', () => {
  it('registers the three preview roots and their descendants as preview', () => {
    for (const path of ['/cafe/transfer-routes', '/cafe/transfer-routes/anything', '/cafe/locations', '/admin/modules?q=cafe', '/admin/modules#x', '/admin/access/modules?view=people']) {
      expect(shipStateInProfile(path, 'full')).toBe('preview')
    }
  })

  it('releases Stock comparison and its stream query', () => {
    for (const path of ['/cafe/stock-comparison', '/cafe/stock-comparison?stream=x']) {
      expect(shipStateInProfile(path, 'full')).toBe('released')
      expect(isShipGated(path)).toBe(false)
    }
  })

  it('gates Hide in MOS on Recipes by its own path and never the Recipes page itself', () => {
    expect(shipStateInProfile('/cafe/recipes/visibility', 'full')).toBe('preview')
    expect(isShipGated('/cafe/recipes/visibility')).toBe(true)
    for (const path of ['/cafe/recipes', '/cafe/recipes?status=All', '/cafe/recipes/visibility-old']) {
      expect(shipStateInProfile(path, 'full')).toBe('released')
      expect(isShipGated(path)).toBe(false)
    }
  })

  it('never gates the existing sibling routes by prefix', () => {
    for (const path of ['/cafe/transfer', '/cafe/transfer-routes-old', '/cafe/location', '/admin/access', '/admin/access/', '/admin/accessible', '/cafe/records']) {
      expect(shipStateInProfile(path, 'full')).toBe('released')
    }
  })

  it('keeps the static hidden paths hidden and profile exclusions hidden', () => {
    expect(shipStateInProfile('/ecommerce/x', 'full')).toBe('hidden')
    expect(shipStateInProfile('/work/events', 'full')).toBe('hidden')
    expect(shipStateInProfile('/work/tasks', 'cafe')).toBe('hidden')
    expect(shipStateInProfile('/work/tasks', 'full')).toBe('released')
  })

  it('treats a preview path as gated everywhere while preview is not allowed', () => {
    expect(isShipGated('/cafe/transfer-routes')).toBe(true)
    expect(isShipGated('/cafe/transfer-routes?origin=all')).toBe(true)
    expect(isShipGated('/admin/modules')).toBe(true)
    expect(isShipGated('/admin/access/modules')).toBe(true)
    expect(isShipGatedInProfile('/cafe/locations', 'full')).toBe(true)
    expect(isShipGated('/cafe/transfer')).toBe(false)
    expect(isShipGated('/admin/access')).toBe(false)
  })
})
