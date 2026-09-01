// value-import-closure — "which modules does loading THIS module actually execute?", answered by
// TypeScript's own parser and module resolver rather than by a regex over the source text.
//
// WHY IT EXISTS. `page-family-migration.test.ts` carries a known-divergence marker for #428 that
// has to go red the moment `pages/follow-ups-page.tsx` starts reaching the shared follow-up queue.
// Earlier spellings of that marker — grep the page for the shared modules' names, then a
// hand-rolled specifier regex — were each defeated by a cutover written in a spelling the author
// had not enumerated: rendering `<FollowUpQueueEmbed/>`, a template-literal dynamic import, a
// `paths` alias other than `@/`. Enumeration lost every time, so this module stops enumerating:
// every import form comes from the AST, and every specifier is resolved by
// `ts.resolveModuleName` against the project's real compiler options. A form or an alias that
// TypeScript understands is one this closure understands, without anyone updating a pattern.
//
// TWO RULES THAT MATTER MORE THAN COVERAGE:
//
//  1. TYPE-ONLY EDGES ARE NOT EDGES — but only the forms that really vanish. `import type`,
//     `export type … from` and `import(…)` in type position erase, so a module reached only
//     through them is never executed and counting one would let the marker claim a cutover that
//     did not happen. (Live, not theoretical: `follow-up-queue-table.tsx` imports
//     `use-follow-up-queue` type-only.) Per-specifier `{ type X }` is NOT one of them, on either
//     an import or an `export … from`: under `verbatimModuleSyntax`, which this project sets,
//     both emit the statement with an empty binding list and the module executes. Both count as
//     value edges. Erring this way costs an early red; erring the other way is the silent green
//     the marker exists to prevent.
//
//  2. WHAT THE WALK CANNOT SEE, IT REPORTS. A dynamic `import()` whose argument is not a static
//     string, or a specifier that resolves nowhere, is exactly where a cutover would hide. Those
//     are returned as `blindSpots` so the caller can fail loud. Silently dropping them is how a
//     guard ends up green over a graph it never actually read.
import * as ts from 'typescript'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** A module specifier found in the source, and whether it survives to runtime. */
type ModuleEdge = {
  /** The specifier exactly as written: `./x`, `@/components/…`, `react`, `#alias/y`. */
  specifier: string
  /** `value` edges execute the target at runtime; `type` edges are erased before anything runs. */
  kind: 'value' | 'type'
  /** Which syntax produced it — carried for failure messages, never for control flow. */
  form: 'import' | 'export-from' | 'import-equals' | 'dynamic-import' | 'import-type'
}

/** A place the walk could not see through. Any of these means the closure is INCOMPLETE. */
type BlindSpot = {
  /** Absolute path of the file that contains it. */
  file: string
  /** Human-readable account of what could not be followed. */
  detail: string
}

type ValueImportClosure = {
  /**
   * Every module reachable from the entry through runtime (value) edges, mapped to the module that
   * imported it. The entry maps to `null`, so a hit can be printed as the chain that produced it.
   * Keys are absolute paths.
   */
  importedBy: Map<string, string | null>
  /** Non-empty means the answer above is not trustworthy — see `BlindSpot`. */
  blindSpots: BlindSpot[]
}

/**
 * Specifiers that legitimately resolve nowhere for TypeScript because a bundler, not the compiler,
 * owns them. Everything else that fails to resolve is reported as a blind spot rather than
 * dropped, including a bare package name — a specifier the compiler cannot place is one this
 * closure cannot follow, whatever the reason.
 */
const BUNDLER_ASSET = /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|mp[34]|webm)(\?.*)?$/i

/** `import(…)` in expression position — the runtime form, not the `import('x').Type` type form. */
function isDynamicImportCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
}

/**
 * A dynamic import's argument is analysable only if it is a plain string with no interpolation.
 * `` import(`./a${b}`) ``, `import(path)` and `import(cond ? 'a' : 'b')` are all rejected —
 * deliberately, because "I could not read this one" must never render as "there was nothing here".
 */
function staticText(arg: ts.Expression | undefined): string | null {
  if (arg === undefined) return null
  // `isStringLiteralLike` is exactly the right predicate: it admits StringLiteral AND
  // NoSubstitutionTemplateLiteral (the `` `./x` `` that beat the previous marker), and admits
  // neither TemplateExpression nor any other expression — which is the line we want.
  return ts.isStringLiteralLike(arg) ? arg.text : null
}

/**
 * Every module specifier in one file, classified. Pure — takes the source text, touches no disk —
 * so the form coverage can be tested against fixtures rather than against the real tree.
 */
export function collectModuleEdges(
  fileName: string,
  sourceText: string,
): { edges: ModuleEdge[]; blindSpots: string[] } {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const edges: ModuleEdge[] = []
  const blindSpots: string[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      // `import './x'` (no clause) is a side-effect import: it executes the module, so it counts.
      const clause = node.importClause
      edges.push({
        specifier: node.moduleSpecifier.text,
        kind: clause?.isTypeOnly === true ? 'type' : 'value',
        form: 'import',
      })
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      edges.push({
        specifier: node.moduleSpecifier.text,
        kind: node.isTypeOnly ? 'type' : 'value',
        form: 'export-from',
      })
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const text = staticText(node.moduleReference.expression)
      if (text === null) {
        blindSpots.push(`import = require(…) with a non-literal argument: ${node.getText()}`)
      } else {
        edges.push({
          specifier: text,
          kind: node.isTypeOnly ? 'type' : 'value',
          form: 'import-equals',
        })
      }
    } else if (isDynamicImportCall(node)) {
      const text = staticText(node.arguments[0])
      if (text === null) {
        blindSpots.push(
          `dynamic import() whose argument is not a static string: ${node.getText().slice(0, 160)}`,
        )
      } else {
        edges.push({ specifier: text, kind: 'value', form: 'dynamic-import' })
      }
    } else if (ts.isImportTypeNode(node)) {
      // `typeof import('x')` / `import('x').Thing` — a type position, erased before runtime.
      const argument = node.argument
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
        edges.push({ specifier: argument.literal.text, kind: 'type', form: 'import-type' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { edges, blindSpots }
}

/** Read the project's real compiler options, so `paths`, `baseUrl` and resolution mode all match. */
export function readCompilerOptions(tsconfigPath: string): ts.CompilerOptions {
  const raw = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (raw.error !== undefined) {
    throw new Error(
      `cannot read ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(raw.error.messageText, ' ')}`,
    )
  }
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(tsconfigPath))
  return parsed.options
}

/**
 * Every module the entry executes, transitively, following runtime edges only.
 *
 * Third-party code is a boundary, not a hole: a specifier that resolves into `node_modules` is
 * recorded as resolved and then not walked. A specifier that resolves NOWHERE is a blind spot
 * unless it is a bundler asset (`.css` and friends), because "TypeScript cannot place this" and
 * "this is not part of the graph" are different statements and only the second one is safe to act
 * on.
 */
export function valueImportClosure(
  entryFile: string,
  compilerOptions: ts.CompilerOptions,
): ValueImportClosure {
  const host = ts.createCompilerHost(compilerOptions)
  const cache = ts.createModuleResolutionCache(
    ts.sys.getCurrentDirectory(),
    (fileName) => fileName,
    compilerOptions,
  )
  const importedBy = new Map<string, string | null>([[entryFile, null]])
  const blindSpots: BlindSpot[] = []
  const queue: string[] = [entryFile]

  while (queue.length > 0) {
    const file = queue[0]
    queue.shift()
    if (!/\.[cm]?tsx?$/.test(file)) {
      // Rule 2: a module this walk reached but cannot parse is exactly where a cutover would hide.
      blindSpots.push({ file, detail: 'reached by an import but is not TypeScript this walk parses' })
      continue
    }
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      blindSpots.push({ file, detail: 'reached by an import but could not be read from disk' })
      continue
    }
    const { edges, blindSpots: unreadable } = collectModuleEdges(file, text)
    for (const detail of unreadable) blindSpots.push({ file, detail })
    for (const edge of edges) {
      if (edge.kind === 'type') continue
      const resolved = ts.resolveModuleName(edge.specifier, file, compilerOptions, host, cache)
        .resolvedModule
      if (resolved === undefined) {
        if (!BUNDLER_ASSET.test(edge.specifier)) {
          blindSpots.push({
            file,
            detail: `\`${edge.specifier}\` (${edge.form}) resolves to no module`,
          })
        }
        continue
      }
      const target = resolved.resolvedFileName
      if (importedBy.has(target)) continue
      importedBy.set(target, file)
      // Third-party packages bound the walk: our own cutover cannot live inside node_modules.
      if (resolved.isExternalLibraryImport === true || /(^|[/\\])node_modules[/\\]/.test(target)) continue
      queue.push(target)
    }
  }
  return { importedBy, blindSpots }
}
