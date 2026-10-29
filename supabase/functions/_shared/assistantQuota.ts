import type { ModelClient } from './modelClient.ts'

type QuotaClient = {
  schema(name: string): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  }
}

const MAX_INPUT_BYTES = 131_072
const MAX_OUTPUT_TOKENS = 4096

export function quotaModelClient(model: ModelClient, client: QuotaClient, orgId: string, personId: string): ModelClient {
  return {
    async create(params) {
      const inputBytes = new TextEncoder().encode(JSON.stringify(params)).byteLength
      if (inputBytes > MAX_INPUT_BYTES || !Number.isInteger(params.max_tokens) || params.max_tokens < 1 || params.max_tokens > MAX_OUTPUT_TOKENS) {
        throw new Error('assistant usage limit reached')
      }
      const db = client.schema('shared')
      const reservation = await db.rpc('reserve_assistant_usage', {
        p_org: orgId, p_person: personId, p_units: inputBytes + params.max_tokens * 4,
      })
      if (reservation.error || typeof reservation.data !== 'string' || !reservation.data) {
        throw new Error('assistant usage limit reached')
      }
      try {
        return await model.create(params)
      } finally {
        try {
          await db.rpc('finish_assistant_usage', { p_id: reservation.data })
        } catch {
          // A failed release retains the reservation and keeps the limit closed.
        }
      }
    },
  }
}
