#!/usr/bin/env node

import { loadChangeGateBaseline } from '../mos-app/e2e/design-quality/change-gate.ts'

const [evidenceDir, expectedSha, expectedDigest] = process.argv.slice(2)
if (!evidenceDir || !expectedSha) {
  console.error('usage: validate-design-baseline.mjs <evidence-dir> <exact-merge-base-sha> [preflight-artifact-digest]')
  process.exit(2)
}

const result = await loadChangeGateBaseline(evidenceDir, expectedSha, expectedDigest)
process.stdout.write(`${JSON.stringify(result)}\n`)
if (!result.ok) process.exit(1)
