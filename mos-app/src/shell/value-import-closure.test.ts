// The false-negative probe for the #428 divergence marker, kept as a test rather than run once by
// hand. Earlier versions of that marker looked complete and were not — a cutover written in an
// unenumerated spelling walked straight past each one — so every spelling that defeated a previous
// version is pinned here, against a throwaway fixture tree, alongside the forms that must NOT read
// as a cutover.
//
// The fixture tree is deliberately not the app: these cases have to keep failing-if-broken even
// after `pages/follow-ups-page.tsx` is rebuilt and the marker itself is deleted.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CompilerOptions } from 'typescript'
import { collectModuleEdges, readCompilerOptions, valueImportClosure } from './value-import-closure'

let root: string
let options: CompilerOptions

/** Absolute path of a fixture module, for comparing against closure keys. */
const at = (relative: string): string => join(root, relative)

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'value-import-closure-'))
  mkdirSync(join(root, 'src', 'target'), { recursive: true })
  mkdirSync(join(root, 'src', 'mid'), { recursive: true })
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        baseUrl: '.',
        // Two aliases, on purpose. `@/` is the app's; the second stands for "some other mapping
        // a future cutover configures" — the bypass that beat the previous marker. Nothing in the
        // closure names either prefix, so both work for the same reason: the compiler resolves them.
        paths: { '@/*': ['./src/*'], '#shared/*': ['./src/target/*'] },
        jsx: 'react-jsx',
        // Mirrors tsconfig.app.json. The classifier reads source text, not this option, so
        // setting it changes no result here — it keeps the fixture honest about the emit rule
        // the app compiles under, which is what makes `import { type X }` a value edge.
        verbatimModuleSyntax: true,
      },
      include: ['src'],
    }),
  )
  // A third-party package, so the boundary rule can be tested rather than asserted in a comment.
  mkdirSync(join(root, 'node_modules', 'fake-pkg'), { recursive: true })
  writeFileSync(
    join(root, 'node_modules', 'fake-pkg', 'package.json'),
    JSON.stringify({ name: 'fake-pkg', version: '1.0.0', main: 'index.js', types: 'index.d.ts' }),
  )
  writeFileSync(join(root, 'node_modules', 'fake-pkg', 'index.js'), `export const pkg = 1\n`)
  writeFileSync(
    join(root, 'node_modules', 'fake-pkg', 'index.d.ts'),
    `import '@/target/queue'\nexport declare const pkg: number\n`,
  )
  // The module a "cutover" must be caught reaching, plus one hop of indirection.
  writeFileSync(join(root, 'src', 'target', 'queue.ts'), `export const queue = 1\n`)
  writeFileSync(join(root, 'src', 'target', 'other.ts'), `export const other = 2\n`)
  writeFileSync(
    join(root, 'src', 'mid', 'embed.ts'),
    `import { queue } from '@/target/queue'\nexport const embed = queue\n`,
  )
  options = readCompilerOptions(join(root, 'tsconfig.json'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Write an entry module with the given body and return what the closure makes of it. */
function closureOf(body: string, extension = '.ts') {
  const entry = join(root, 'src', `entry${extension}`)
  writeFileSync(entry, body)
  const result = valueImportClosure(entry, options)
  return {
    ...result,
    reaches: (relative: string) => result.importedBy.has(at(relative)),
  }
}

const QUEUE = 'src/target/queue.ts'

describe('value-import-closure — every runtime import form is an edge', () => {
  // Each case is a real cutover written a different way. The marker is only as complete as this
  // list is boring: if any of these came back `false`, a cutover could ship green.
  it.each([
    ['a named import', `import { queue } from '@/target/queue'\nconsole.log(queue)\n`],
    ['a default import', `import queue from '@/target/queue'\nconsole.log(queue)\n`],
    ['a namespace import', `import * as q from '@/target/queue'\nconsole.log(q)\n`],
    ['a side-effect import with no bindings', `import '@/target/queue'\n`],
    ['a relative import', `import { queue } from './target/queue'\nconsole.log(queue)\n`],
    ['an extensioned specifier', `import { queue } from './target/queue.ts'\nconsole.log(queue)\n`],
    ['a re-export', `export { queue } from '@/target/queue'\n`],
    ['a star re-export', `export * from '@/target/queue'\n`],
    ['a quoted dynamic import', `export const load = () => import('@/target/queue')\n`],
    [
      'a template-literal dynamic import',
      'export const load = () => import(`@/target/queue`)\n',
    ],
    [
      'an import-equals require',
      `import queue = require('@/target/queue')\nconsole.log(queue)\n`,
    ],
    [
      'an alias other than @/',
      `import { queue } from '#shared/queue'\nconsole.log(queue)\n`,
    ],
    [
      'a transitive reach through a component that composes it',
      `import { embed } from '@/mid/embed'\nconsole.log(embed)\n`,
    ],
  ])('%s reaches the target', (_label, body) => {
    const closure = closureOf(body)
    expect(closure.blindSpots, 'a clean form should report nothing unreadable').toEqual([])
    expect(closure.reaches(QUEUE), `this form left the target out of the closure:\n${body}`).toBe(
      true,
    )
  })

  it('works the same in .tsx, where a cutover would actually be written', () => {
    const closure = closureOf(
      `import { queue } from '@/target/queue'\nexport const El = () => <p>{queue}</p>\n`,
      '.tsx',
    )
    expect(closure.reaches(QUEUE)).toBe(true)
  })

  it('records the importer, so a hit can be printed as a chain', () => {
    const closure = closureOf(`import { embed } from '@/mid/embed'\nconsole.log(embed)\n`)
    expect(closure.importedBy.get(at(QUEUE))).toBe(at('src/mid/embed.ts'))
    expect(closure.importedBy.get(at('src/mid/embed.ts'))).toBe(at('src/entry.ts'))
    expect(closure.importedBy.get(at('src/entry.ts'))).toBeNull()
  })
})

describe('value-import-closure — erased imports are not edges', () => {
  // A type-only import renders nothing, so counting one would let the marker announce a cutover
  // that cannot have happened. This is live in the app, not hypothetical: follow-up-queue-table
  // imports use-follow-up-queue type-only.
  it.each([
    ['import type', `import type { queue } from '@/target/queue'\nexport type Q = typeof queue\n`],
    ['export type … from', `export type { queue } from '@/target/queue'\n`],
    ['an import() type node', `export type Q = typeof import('@/target/queue').queue\n`],
    [
      'import type = require',
      `import type queue = require('@/target/queue')\nexport type Q = typeof queue\n`,
    ],
  ])('%s does not reach the target', (_label, body) => {
    const closure = closureOf(body)
    expect(closure.blindSpots).toEqual([])
    expect(closure.reaches(QUEUE), `an erased import was counted as a runtime edge:\n${body}`).toBe(
      false,
    )
  })

  it('a mixed list still counts — one value binding is enough to execute the module', () => {
    const closure = closureOf(
      `import { queue, type Other } from '@/target/queue'\nexport type O = Other\nconsole.log(queue)\n`,
    )
    expect(closure.reaches(QUEUE)).toBe(true)
  })

  it('`export { type X } from` still counts, for the same reason', () => {
    // The export half of the same rule. It emits `export {} from '…'` and executes the module.
    const closure = closureOf(`export { type queue } from '@/target/queue'\n`)
    expect(closure.blindSpots).toEqual([])
    expect(closure.reaches(QUEUE)).toBe(true)
  })

  it('a wholly per-specifier `{ type X }` list still counts — verbatimModuleSyntax keeps it', () => {
    // The one form that LOOKS erased and is not: tsc emits `import {} from '…'`, so the module
    // executes. Reading it as erased is the false green this whole module exists to prevent.
    const closure = closureOf(
      `import { type queue } from '@/target/queue'\nexport type Q = typeof queue\n`,
    )
    expect(closure.blindSpots).toEqual([])
    expect(closure.reaches(QUEUE)).toBe(true)
  })
})

describe('value-import-closure — a cycle terminates', () => {
  // The memo is written before the enqueue, which is the only reason a cycle ends. Inverting those
  // two lines hangs CI instead of failing it, so the ordering gets its own case.
  it('walks a → b → a without spinning', () => {
    writeFileSync(join(root, 'src', 'mid', 'b.ts'), `import '@/entry'\nexport const b = 1\n`)
    const closure = closureOf(`import { b } from '@/mid/b'\nconsole.log(b)\n`)
    expect(closure.blindSpots).toEqual([])
    expect(closure.reaches('src/mid/b.ts')).toBe(true)
  })
})

describe('value-import-closure — what it cannot see, it reports', () => {
  // The closure's own honesty check. An unreadable specifier is exactly where a cutover would
  // hide, so it must surface as a blind spot rather than as a quiet `false`.
  it.each([
    ['a template with a substitution', 'export const load = (n: string) => import(`@/target/${n}`)\n'],
    ['an identifier argument', `export const load = (p: string) => import(p)\n`],
    ['a conditional argument', `export const load = (b: boolean) => import(b ? '@/target/queue' : '@/target/other')\n`],
    ['a concatenated argument', `export const load = (n: string) => import('@/target/' + n)\n`],
  ])('%s is a blind spot', (_label, body) => {
    const closure = closureOf(body)
    expect(closure.blindSpots.length, `read this silently:\n${body}`).toBeGreaterThan(0)
    expect(closure.blindSpots[0].detail).toContain('not a static string')
  })

  it('a specifier that resolves nowhere is a blind spot, not a silent skip', () => {
    const closure = closureOf(`import { x } from '~unconfigured/queue'\nconsole.log(x)\n`)
    expect(closure.blindSpots.map((spot) => spot.detail).join(' ')).toContain('resolves to no module')
  })

  // A package is a boundary, not a hole: it is recorded as resolved (so it is not mistaken for an
  // unreadable specifier) and then not walked. Our cutover cannot live inside node_modules, and
  // walking in would drag the whole dependency tree through the parser on every run.
  it('a third-party package is recorded and then not walked into', () => {
    const closure = closureOf(`import { pkg } from 'fake-pkg'\nconsole.log(pkg)\n`)
    expect(closure.blindSpots, 'a resolvable package is not a blind spot').toEqual([])
    expect([...closure.importedBy.keys()].some((key) => key.includes('fake-pkg'))).toBe(true)
    expect(
      closure.reaches(QUEUE),
      'the package re-exports the target, but the walk must stop at the package boundary',
    ).toBe(false)
  })

  it('a bundler asset is not — those never resolve and never hide a cutover', () => {
    const closure = closureOf(`import './entry.css'\nimport '@/target/queue'\n`)
    expect(closure.blindSpots).toEqual([])
    expect(closure.reaches(QUEUE)).toBe(true)
  })

  it('a blind spot names the file it is in, so it can be gone and fixed', () => {
    const closure = closureOf(`export const load = (p: string) => import(p)\n`)
    expect(closure.blindSpots[0].file).toBe(at('src/entry.ts'))
  })

  it('import = require with a non-literal argument is a blind spot', () => {
    const closure = closureOf(`import queue = require(where)\nconsole.log(queue)\n`)
    expect(closure.blindSpots.map((spot) => spot.detail).join(' ')).toContain(
      'non-literal argument',
    )
  })

  // The nastiest silent-green of all: point the walk at a file that is not there and an empty
  // closure comes back, which reads exactly like "nothing was reached". A marker built on this
  // would go permanently green the day someone renames the page it watches.
  it('an entry that does not exist is a blind spot, not an empty green closure', () => {
    const result = valueImportClosure(at('src/renamed-away.ts'), options)
    expect(result.importedBy.size, 'only the missing entry itself').toBe(1)
    expect(result.blindSpots.map((spot) => spot.detail).join(' ')).toContain(
      'could not be read from disk',
    )
  })
})

describe('collectModuleEdges — the parse, without the disk', () => {
  it('classifies a file that mixes every form at once', () => {
    const { edges, blindSpots } = collectModuleEdges(
      'mixed.tsx',
      [
        `import './side-effect'`,
        `import a from './a'`,
        `import type { B } from './b'`,
        `export * from './c'`,
        `export type { D } from './d'`,
        `import e = require('./e')`,
        `const f = () => import('./f')`,
        `const g = (p: string) => import(p)`,
        `type H = typeof import('./h')`,
        `console.log(a, e, f, g)`,
      ].join('\n'),
    )
    const value = edges.filter((edge) => edge.kind === 'value').map((edge) => edge.specifier)
    const type = edges.filter((edge) => edge.kind === 'type').map((edge) => edge.specifier)
    expect(value.sort()).toEqual(['./a', './c', './e', './f', './side-effect'])
    expect(type.sort()).toEqual(['./b', './d', './h'])
    expect(blindSpots).toHaveLength(1)
    expect(blindSpots[0]).toContain('import(p)')
  })

  it('carries the form, so a failure can say how the edge was written', () => {
    const { edges } = collectModuleEdges('f.ts', `import x = require('./x')\nconsole.log(x)\n`)
    expect(edges).toEqual([{ specifier: './x', kind: 'value', form: 'import-equals' }])
  })
})

describe('readCompilerOptions', () => {
  it('reads the project tsconfig the marker actually depends on', () => {
    const appOptions = readCompilerOptions(join(__dirname, '..', '..', 'tsconfig.app.json'))
    expect(appOptions.paths, 'the @/ mapping is what makes the marker alias-proof').toHaveProperty(
      '@/*',
    )
  })

  it('refuses a tsconfig it cannot read rather than resolving against nothing', () => {
    expect(() => readCompilerOptions(join(root, 'no-such-tsconfig.json'))).toThrow(/cannot read/)
  })
})
