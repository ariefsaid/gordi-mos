import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(process.cwd(), 'src')
const ALLOWED_DEFINITIONS = new Set(['lib/format/date.ts'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('WIB date ownership', () => {
  it('keeps local today helpers and UTC current-day slices out of production callers', () => {
    const files = sourceFiles(SRC)
    const unapprovedDefinitions: string[] = []
    const utcTodaySlices: string[] = []

    for (const file of files) {
      const rel = relative(SRC, file)
      const source = readFileSync(file, 'utf8')
      if (!/\.test\.[jt]sx?$/.test(file)) {
        if (/\bfunction\s+wibToday\s*\(|\b(?:const|let|var)\s+wibToday\s*=/.test(source)
          && !ALLOWED_DEFINITIONS.has(rel)) unapprovedDefinitions.push(rel)

        const directDates = /new Date\(\s*(?:Date\.now\(\))?\s*\)\.toISOString\(\)\.slice\(0,\s*10\)/g
        for (const match of source.matchAll(directDates)) {
          utcTodaySlices.push(`${rel}:${source.slice(0, match.index).split('\n').length}`)
        }
        const slices = /\b([\w$]+)\.toISOString\(\)\.slice\(0,\s*10\)/g
        for (const match of source.matchAll(slices)) {
          const receiver = match[1]
          const before = source.slice(Math.max(0, (match.index ?? 0) - 240), match.index)
          const currentDate = receiver === 'today' || receiver === 'now'
            || new RegExp(`\\b(?:const|let|var)\\s+${receiver}\\s*=\\s*new Date\\(\\s*(?:Date\\.now\\(\\))?\\s*\\)`).test(before)
          if (currentDate) utcTodaySlices.push(`${rel}:${source.slice(0, match.index).split('\n').length}`)
        }
      }
    }

    expect(unapprovedDefinitions).toEqual([])
    expect(utcTodaySlices).toEqual([])
  })
})
