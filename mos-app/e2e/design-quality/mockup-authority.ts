import path from 'node:path'

import type { DesignQualityManifest, ManifestCell } from './manifest'

export type MockupAuthorityEntry = {
  path: string
  authority: string
  requiredRegions: string[]
  route: string
  viewport: string
  cellId: string
  fixture: string
  theme: string
  language: string
  state: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : []
}

function manifestViewport(value: string): string | undefined {
  if (/^(?:phone|compact|desktop)-\d+x\d+$/.test(value)) return value
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) return undefined
  const prefix = match[1] === '390' ? 'phone' : match[1] === '1024' ? 'compact' : match[1] === '1440' ? 'desktop' : undefined
  return prefix ? `${prefix}-${match[1]}x${match[2]}` : undefined
}

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('mockup authority entries must be objects')
  }
}

/**
 * Parse an approved authority row into the dimensions needed to select its
 * browser evidence. Every row is required to name the exact manifest cell;
 * route and viewport alone are not a stable state binding.
 */
export function parseMockupAuthorityEntry(
  value: unknown,
  repoRoot: string,
  inheritedAuthority = '',
): MockupAuthorityEntry {
  assertObject(value)
  const image = asString(value.path || value.file || value.authority_image)
  const authority = asString(value.authority || value.source_decision_citation || inheritedAuthority)
  if (!image || !authority) throw new Error('every mockup must name an image and its authority')
  if (value.status !== undefined && value.status !== 'approved') {
    throw new Error(`mockup ${image} is not approved by the supplied authority list`)
  }
  if (value.comp_diff_valid === false) {
    throw new Error(`mockup ${image} is not valid for comp-diff according to its authority list`)
  }

  const imagePath = path.resolve(repoRoot, image)
  const rootPath = path.resolve(repoRoot)
  if (!imagePath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`mockup ${image} is outside the repository workspace`)
  }

  const dimensions = {
    cellId: asString(value.cellId || value.cell_id),
    route: asString(value.route),
    viewport: asString(value.viewport),
    fixture: asString(value.fixture),
    theme: asString(value.theme),
    language: asString(value.language),
    state: asString(value.state),
  }
  const missing = Object.entries(dimensions)
    .filter(([, dimension]) => !dimension)
    .map(([name]) => name)
  if (missing.length > 0) {
    throw new Error(`mockup ${image} must declare ${missing.join(', ')}, including an explicit manifest cellId`)
  }

  return {
    path: imagePath,
    authority,
    requiredRegions: asStringArray(value.requiredRegions ?? value.required_regions),
    ...dimensions,
  }
}

/**
 * Resolve and verify the exact manifest cell used for an authority image.
 * All six dimensions are checked so a valid route/viewport pair cannot select
 * the wrong role, theme, language, or semantic state.
 */
export function bindMockupToCell(
  entry: MockupAuthorityEntry,
  manifest: DesignQualityManifest,
): ManifestCell {
  const cell = manifest.cells.find((candidate) => candidate.id === entry.cellId)
  if (!cell) {
    throw new Error(`mockup ${entry.path} references unknown manifest cellId ${entry.cellId}`)
  }

  const dimensionNames = ['route', 'viewport', 'fixture', 'theme', 'language', 'state'] as const
  const mismatches = dimensionNames
    .filter((dimension) => {
      const authorityValue = dimension === 'viewport'
        ? manifestViewport(entry[dimension])
        : entry[dimension]
      return authorityValue !== cell[dimension]
    })
    .map((dimension) => `${dimension}=${entry[dimension]} (manifest=${cell[dimension]})`)
  if (mismatches.length > 0) {
    throw new Error(
      `mockup ${entry.path} cellId ${entry.cellId} does not match the manifest: ${mismatches.join(', ')}`,
    )
  }

  return cell
}
