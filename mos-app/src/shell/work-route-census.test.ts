import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { matchRoutes } from 'react-router-dom'
import { routeConfig } from '@/router'
import { flattenRoutes, allRedirects, leafInThisTable } from '@/test/route-table'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path)
      : /\.tsx?$/.test(path) && !/\.(test|stories)\./.test(path) ? [path] : []
  })
}

function destination(path: string): string {
  return path.replace(/\$\{[^}]+\}/g, 'fixture-id').replace(/:[A-Za-z]+/g, 'fixture-id').split(/[?#]/)[0]
}

describe('R7 current Work route census', () => {
  it('resolves every canonical record family and all source Work URL literals without an orphan route', () => {
    const expected = ['/work/tasks/:taskId', '/work/signals/:signalId', '/work/projects/:workLineId', '/work/objectives/:objectiveId']
    const routes = flattenRoutes().filter(({ path }) => /^\/work\//.test(path))
    for (const path of expected) {
      expect(routes.some((row) => row.path === path)).toBe(true)
      const match = leafInThisTable(destination(path))
      expect(match).toBeDefined()
      expect(match!.route.path).not.toBe('*')
    }
    const references = sourceFiles(join(process.cwd(), 'src')).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return [...text.matchAll(/['"`]((?:\/work\/(?:tasks|signals|projects|objectives))[^'"`\n]*)['"`]/g)]
        .filter((match) => !match[1].includes(' '))
        .map((match) => ({ file: relative(process.cwd(), file), source: match[1], path: destination(match[1]) }))
    })
    const orphans = references.filter(({ path }) => {
      const matches = matchRoutes(routeConfig, path)
      return !matches || matches.at(-1)!.route.path === '*'
    })
    expect(orphans).toEqual([])
    const report = {
      canonicalRecordFamilies: expected,
      routes: routes.map(({ path }) => path),
      redirects: allRedirects().filter((row) => /tasks|objectives|projects|signals|updates|cascade/.test(row.from)),
      sourceReferences: references,
      orphanSourceReferences: orphans,
      limits: 'Literal and template-prefix census only; arbitrary runtime-generated paths and database referential integrity are separate evidence.',
    }
    if (process.env.GORDI_ROUTE_CENSUS_OUTPUT) writeFileSync(process.env.GORDI_ROUTE_CENSUS_OUTPUT, JSON.stringify(report, null, 2))
  })
})
