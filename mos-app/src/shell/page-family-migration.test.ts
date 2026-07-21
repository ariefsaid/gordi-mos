import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routeConfig } from '@/router'
import { PAGE_FAMILIES } from './page-families'
import { collectV3Routes } from './route-classification'
import {
  ISSUE_3_DEFERRED_PAGE_ROUTES,
  ISSUE_3_REPRESENTATIVE_ROUTES,
  ISSUE_11_MIGRATED_ROUTES,
  PAGE_FAMILY_FRAME_ROUTES,
  assertPageFamilyMigration,
  type PageFamilyMigrationEntry,
} from './page-family-migration'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function productPagePaths() {
  return collectV3Routes(routeConfig)
    .filter(({ handle }) => handle.kind === 'page')
    .map(({ path }) => path)
}

describe('V3 page-family migration guard', () => {
  it('requires the representative + migrated + deferred union to equal classified product pages', () => {
    expect(() => assertPageFamilyMigration(
      [...ISSUE_3_REPRESENTATIVE_ROUTES, ...ISSUE_11_MIGRATED_ROUTES],
      ISSUE_3_DEFERRED_PAGE_ROUTES,
      productPagePaths(),
    )).not.toThrow()
  })

  it('rejects duplicate paths, missing union members, and unsupported family values', () => {
    const actualPaths = productPagePaths()
    const representative = ISSUE_3_REPRESENTATIVE_ROUTES
    const deferred = ISSUE_3_DEFERRED_PAGE_ROUTES

    expect(() => assertPageFamilyMigration(
      [...representative, representative[0]],
      deferred,
      actualPaths,
    )).toThrow(/duplicate/i)

    expect(() => assertPageFamilyMigration(
      representative,
      deferred.slice(1),
      actualPaths,
    )).toThrow(/union|missing/i)

    const unsupportedFamily = {
      ...representative[0],
      family: 'future-family',
    } as unknown as PageFamilyMigrationEntry
    expect(() => assertPageFamilyMigration(
      [unsupportedFamily, ...representative.slice(1)],
      deferred,
      actualPaths,
    )).toThrow(/family/i)
  })

  it('keeps every migrated consumer on PageFamilyFrame with no raw frame/head pair', () => {
    for (const entry of PAGE_FAMILY_FRAME_ROUTES) {
      const source = readSource(entry.sourceFile)
      expect(source).toContain('PageFamilyFrame')
      expect(source).not.toMatch(/<PageFrame\b/)
      expect(source).not.toMatch(/<PageHead\b/)
    }
  })

  it('keeps the shared family seam free of future tokens and universal record renderers', () => {
    const sharedSources = [
      'src/shell/page-families.ts',
      'src/shell/page-family-frame.tsx',
      'src/shell/page-frame.tsx',
      'src/shell/page-head.tsx',
      'src/shell/page-families.css',
    ]

    for (const path of sharedSources) {
      const source = readSource(path)
      expect(source).not.toMatch(/--e7-/)
      expect(source).not.toMatch(/RecordViewer|RecordCollection/)
    }
    expect(PAGE_FAMILIES).toEqual(['workspace', 'focused-record', 'management'])
  })
})
