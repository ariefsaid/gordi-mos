import { readAuditFixtureSentinelLedger } from './audit-provisioner'
import defaultGlobalTeardown from '../global-teardown'
import {
  exactLiveFixtureRows,
  liveFixtureRuntime,
  matchesLiveFixtureOwnership,
} from './audit-fixture-live-global-setup'

export default async function auditFixtureLiveGlobalTeardown(): Promise<void> {
  const failures: unknown[] = []
  try {
    await defaultGlobalTeardown()
  } catch (error) {
    failures.push(error)
  }

  try {
    const runtime = liveFixtureRuntime()
    const ledger = await readAuditFixtureSentinelLedger(runtime.ledgerPath, runtime.bindingSecret)
    for (const intent of ledger.intents) {
      const rows = await exactLiveFixtureRows(runtime.sql, intent.table, intent.id)
      const row = rows[0]
      const version = typeof row === 'object' && row !== null && !Array.isArray(row)
        ? (row as Record<string, unknown>).audit_fixture_xmin
        : undefined
      if (rows.length !== 1 || !matchesLiveFixtureOwnership(row, intent.ownership) || version !== intent.version) {
        throw new Error(`default Playwright hooks changed or removed sentinel ${intent.table}:${intent.id}`)
      }
    }
  } catch (error) {
    failures.push(error)
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, 'default Playwright hook sentinel proof failed')
  }
}
