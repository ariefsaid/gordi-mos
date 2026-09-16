#!/usr/bin/env node

import { loadTrustedAutomaticFailureBaseline } from '../mos-app/e2e/design-quality/change-gate.ts'

const [repoRoot, candidateSha, verificationBase = 'origin/dev'] = process.argv.slice(2)
if (!repoRoot || !candidateSha) {
  console.error('usage: validate-design-baseline.mjs <repo-root> <candidate-sha> [verification-base]')
  process.exit(2)
}

const result = await loadTrustedAutomaticFailureBaseline({ repoRoot, candidateSha, verificationBase })
process.stdout.write(`${JSON.stringify(result)}\n`)
if (!result.ok) process.exit(1)
