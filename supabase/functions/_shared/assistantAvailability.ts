import { effectiveModuleAccess, type PersonModuleOverride } from '../../../mos-app/src/lib/module-access.ts'
import { logStructuredError } from './errorLog.ts'
import type { EdgeFunctionName } from './errorLog.ts'

type SettingQuery = {
  eq(column: string, value: string): SettingQuery
  maybeSingle(): Promise<{ data: unknown; error: unknown | null }>
}
type AssistantSettingsClient = {
  schema(schema: string): {
    from(table: string): {
      select(columns: string): SettingQuery
    }
  }
}

export type AssistantAvailability = { allowed: true } | { allowed: false; reason: 'off' | 'unavailable' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isOverride = (value: unknown): value is PersonModuleOverride =>
  value === 'inherit' || value === 'allow' || value === 'block'

export async function checkAssistantAvailability(
  client: unknown,
  orgId: string,
  personId: string,
  fn: EdgeFunctionName,
): Promise<AssistantAvailability> {
  try {
    const settings = (client as AssistantSettingsClient).schema('mos')
    const [orgResult, personResult] = await Promise.all([
      settings.from('org_module_settings').select('enabled')
        .eq('org_id', orgId).eq('module_id', 'assistant').maybeSingle(),
      settings.from('person_module_settings').select('override')
        .eq('org_id', orgId).eq('person_id', personId).eq('module_id', 'assistant').maybeSingle(),
    ])
    if (orgResult.error || personResult.error) return unavailable(fn)

    let orgEnabled = false
    if (orgResult.data !== null) {
      if (!isRecord(orgResult.data) || typeof orgResult.data.enabled !== 'boolean') return unavailable(fn)
      orgEnabled = orgResult.data.enabled
    }

    let override: PersonModuleOverride = 'inherit'
    if (personResult.data !== null) {
      if (!isRecord(personResult.data) || !isOverride(personResult.data.override)) return unavailable(fn)
      override = personResult.data.override
    }

    const result = effectiveModuleAccess({ released: true, orgEnabled, override, roleAdmitted: true })
    return result.available ? { allowed: true } : { allowed: false, reason: 'off' }
  } catch {
    return unavailable(fn)
  }
}

function unavailable(fn: EdgeFunctionName): AssistantAvailability {
  logStructuredError({ fn, errorCode: 'ASSISTANT_SETTING_UNAVAILABLE' })
  return { allowed: false, reason: 'unavailable' }
}

/** The refusal for a caller whose assistant is unavailable (403) or unreadable (503); null when allowed. */
export function assistantRefusalResponse(
  availability: AssistantAvailability,
  corsHeaders: Record<string, string>,
): Response | null {
  if (availability.allowed) return null
  const body = availability.reason === 'unavailable'
    ? { status: 503, error: 'MODULE_AVAILABILITY_UNAVAILABLE' }
    : { status: 403, error: 'MODULE_OFF', detail: 'assistant is not available for this person' }
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
