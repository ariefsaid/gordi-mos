/**
 * Codemod: convert export default → named export in mos-app/src/**
 * and rewrite all matching default import sites to named imports.
 *
 * Run from repo root:
 *   node scripts/codemod-named-exports.mjs
 */

import { Project } from 'ts-morph'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname   // script lives inside mos-app/
const SRC = path.join(ROOT, 'src')

const project = new Project({
  tsConfigFilePath: path.join(ROOT, 'tsconfig.app.json'),
  addFilesFromTsConfig: true,
})

// ─── PASS 1: Collect default export name per file ───────────────────────────
// Map<absoluteFilePath, exportedName>
const defaultExportNames = new Map()

for (const sourceFile of project.getSourceFiles()) {
  const fp = sourceFile.getFilePath()
  if (!fp.startsWith(SRC)) continue

  // Case A: `export default function Foo` / `export default class Foo`
  for (const decl of [
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses(),
  ]) {
    if (decl.isDefaultExport()) {
      const name = decl.getName()
      if (name) {
        defaultExportNames.set(fp, name)
        break
      }
    }
  }

  if (defaultExportNames.has(fp)) continue

  // Case B: `export default Foo` (ExportAssignment)
  for (const ea of sourceFile.getExportAssignments()) {
    if (!ea.isExportEquals()) {
      const expr = ea.getExpression()
      const name = expr.getText().trim()
      if (name && /^[A-Z_$a-z]/.test(name)) {
        defaultExportNames.set(fp, name)
      }
      break
    }
  }
}

console.log(`Found ${defaultExportNames.size} files with default exports:`)
for (const [fp, name] of defaultExportNames) {
  console.log(`  ${path.relative(ROOT, fp)} → ${name}`)
}

// ─── PASS 2: Rewrite export sites ────────────────────────────────────────────
for (const sourceFile of project.getSourceFiles()) {
  const fp = sourceFile.getFilePath()
  if (!fp.startsWith(SRC)) continue
  if (!defaultExportNames.has(fp)) continue

  const name = defaultExportNames.get(fp)
  let changed = false

  // Case A: `export default function Foo` / `export default class Foo`
  for (const decl of [
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses(),
  ]) {
    if (decl.isDefaultExport() && decl.getName() === name) {
      // Remove `default` from modifiers
      decl.toggleModifier('default', false)
      changed = true
      break
    }
  }

  // Case B: export assignment `export default Foo`
  if (!changed) {
    for (const ea of sourceFile.getExportAssignments()) {
      if (!ea.isExportEquals()) {
        // If the expression is just a name, the named decl already exists — just remove the assignment
        ea.remove()
        changed = true
        break
      }
    }
  }

  if (changed) {
    console.log(`  EXPORT: ${path.relative(ROOT, fp)}`)
  }
}

// ─── PASS 3: Rewrite import sites ────────────────────────────────────────────
for (const sourceFile of project.getSourceFiles()) {
  const fp = sourceFile.getFilePath()
  if (!fp.startsWith(SRC)) continue

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const defaultImport = importDecl.getDefaultImport()
    if (!defaultImport) continue

    const resolvedFile = importDecl.getModuleSpecifierSourceFile()
    if (!resolvedFile) continue

    const resolvedFp = resolvedFile.getFilePath()
    const exportedName = defaultExportNames.get(resolvedFp)
    if (!exportedName) continue

    const localName = defaultImport.getText()

    // Replace default import with named import
    importDecl.removeDefaultImport()

    const existingNamed = importDecl.getNamedImports()
    const alreadyHas = existingNamed.some(n => n.getName() === exportedName)
    if (!alreadyHas) {
      if (localName === exportedName) {
        importDecl.addNamedImport(exportedName)
      } else {
        // local alias differs — keep the alias
        importDecl.addNamedImport({ name: exportedName, alias: localName })
      }
    }

    const aliasStr = localName !== exportedName ? ` as ${localName}` : ''
    console.log(`  IMPORT: ${path.relative(ROOT, fp)} — ${localName} → { ${exportedName}${aliasStr} }`)
  }
}

// ─── PASS 4: Save all ────────────────────────────────────────────────name────
await project.save()
console.log('\nDone. All files saved.')
