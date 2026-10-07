import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(process.cwd(), 'src')
const tokenFile = resolve(sourceRoot, 'index.css')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : [path]
  })
}

function rawCssZIndexValues(css: string): string[] {
  const declarations = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/(?<![-\w])z-index\s*:\s*([^;{}]+)/g)
  return [...declarations]
    .map(([, value]) => value.trim().replace(/\s*!important\s*$/, ''))
    .filter((value) => !['-1', '0', '1'].includes(value) && /(?<![\w-])-?\d+(?![\w-])/.test(value))
}

function rawInlineZIndexValues(source: string): string[] {
  return [...source.matchAll(/\bzIndex\s*:\s*(?:'(-?\d+)'|"(-?\d+)"|(-?\d+))\b/g)]
    .map(([, singleQuoted, doubleQuoted, bare]) => singleQuoted ?? doubleQuoted ?? bare)
    .filter((value) => !['-1', '0', '1'].includes(value))
}

const orderedLayers = [
  ['--z-inline-raised', 2],
  ['--z-inline-floating', 3],
  ['--z-sticky', 10],
  ['--z-popover', 20],
  ['--z-drawer', 30],
  ['--z-drawer-popover', 31],
  ['--z-modal', 40],
  ['--z-modal-popover', 41],
  ['--z-toast', 50],
  ['--z-popover-top', 100],
] as const

const tokens = readFileSync(tokenFile, 'utf8')

describe('application z-index layer scale', () => {
  it('keeps the existing low-to-high stacking order', () => {
    const values = orderedLayers.map(([name]) => {
      const match = tokens.match(new RegExp(`${name}:\\s*(-?\\d+)\\s*;`))
      expect(match, `${name} is defined in the global token file`).not.toBeNull()
      return Number(match?.[1])
    })
    expect(values).toEqual(orderedLayers.map(([, expected]) => expected))
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  it('rejects raw z-index values outside the token file', () => {
    const offenders = sourceFiles(sourceRoot)
      .filter((path) => path.endsWith('.css') && path !== tokenFile)
      .flatMap((path) => rawCssZIndexValues(readFileSync(path, 'utf8')).map((value) => `${relative(sourceRoot, path)}: ${value}`))
      .concat(
        sourceFiles(sourceRoot)
          .filter((path) => path.endsWith('.tsx'))
          .flatMap((path) => rawInlineZIndexValues(readFileSync(path, 'utf8')).map((value) => `${relative(sourceRoot, path)}: ${value}`)),
      )

    expect(offenders).toEqual([])
  })

  it('allows local stacking exceptions and detects a new literal tier', () => {
    expect(rawCssZIndexValues('.local { z-index: 1; } .raised { z-index: 2; }')).toEqual(['2'])
    expect(rawCssZIndexValues('.under { z-index: -1; } .base { z-index: 0; }')).toEqual([])
    expect(rawInlineZIndexValues("const style = { zIndex: 90 }; const local = { zIndex: 1 };"))
      .toEqual(['90'])
  })
})
