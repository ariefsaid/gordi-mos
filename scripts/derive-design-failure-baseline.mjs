#!/usr/bin/env node

/** Operator-only command: derive the next committed automatic-failure snapshot from evidence. */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { createAutomaticFailureBaseline } from '../mos-app/e2e/design-quality/change-gate.ts'

const args = process.argv.slice(2)
const value = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : ''
}
const evidenceDir = args[0]
const repoRoot = value('--repo-root') || process.cwd()
const sourceProductSha = value('--source-product-sha')
const sourceHarnessSha = value('--source-harness-sha') || (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim() } catch { return '' }
})()
const sessionArg = value('--session-id')
const previousPath = value('--previous-snapshot')

if (!evidenceDir || !sourceProductSha || !sourceHarnessSha) {
  console.error('usage: derive-design-failure-baseline.mjs <evidence-dir> --source-product-sha <sha> [--source-harness-sha <sha>] [--session-id <id>] [--repo-root <repo>] [--previous-snapshot <json>]')
  process.exit(2)
}

let sessionId = sessionArg
if (!sessionId) {
  try {
    const session = JSON.parse(await readFile(path.join(evidenceDir, 'session.json'), 'utf8'))
    sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
  } catch { /* producer reports a precise missing session error below */ }
}
let previousSnapshot
if (previousPath) {
  try { previousSnapshot = JSON.parse(await readFile(previousPath, 'utf8')) } catch (error) {
    console.error(`derive-design-failure-baseline: previous snapshot is unreadable: ${String(error)}`)
    process.exit(1)
  }
}
const result = await createAutomaticFailureBaseline({
  evidenceDir,
  repoRoot,
  sourceProductSha,
  sourceHarnessSha,
  sourceSessionId: sessionId,
  previousSnapshot,
})
if (!result.ok) {
  for (const error of result.errors) console.error(`derive-design-failure-baseline: ${error}`)
  process.exit(1)
}
process.stdout.write(`${result.outputPath}\n`)
