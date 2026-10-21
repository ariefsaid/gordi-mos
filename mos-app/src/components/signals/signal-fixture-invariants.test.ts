import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.ts', '.tsx'].includes(extname(path)) ? [path] : []
  })
}

function literalString(expression: ts.Expression): string | null {
  if (ts.isStringLiteral(expression)) return expression.text
  if (ts.isAsExpression(expression)) return literalString(expression.expression)
  return null
}

function invalidAudienceTeamPairs(filePath: string): string[] {
  const text = readFileSync(filePath, 'utf8')
  // Only files that set owning_team_id can hold a pair; parsing the rest timed out under coverage.
  if (!text.includes('owning_team_id')) return []
  const extension = extname(filePath)
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    extension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const invalidPairs: string[] = []

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      const audience = node.properties.find((property) =>
        ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'audience',
      )
      const owningTeam = node.properties.find((property) =>
        ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'owning_team_id',
      )
      if (audience && owningTeam && ts.isPropertyAssignment(audience) && ts.isPropertyAssignment(owningTeam)) {
        const audienceValue = literalString(audience.initializer)
        const teamValue = literalString(owningTeam.initializer)
        const isNullTeam = owningTeam.initializer.kind === ts.SyntaxKind.NullKeyword
        if ((audienceValue === 'org' && teamValue !== null) || (audienceValue === 'team' && isNullTeam)) {
          invalidPairs.push(`${filePath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return invalidPairs
}

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('Signal fixtures', () => {
  it('keeps audience and owning Team combinations allowed by the database CHECK', () => {
    const invalidPairs = sourceFiles(sourceDirectory).flatMap(invalidAudienceTeamPairs)
    expect(invalidPairs).toEqual([])
  })
})
