import { supabase } from '@/lib/supabase'
import { ContractError, type ContractErrorCode, type UUID, type WriteContext } from './contract'

export type RecipeVisibility = {
  recipe_key: string
  hidden: boolean
  row_version: number
  updated_at: string
  updated_by: UUID | null
}

const PAGE_SIZE = 500
const CONTRACT_CODES: Record<string, ContractErrorCode> = {
  '22023': 'INVALID',
  '42501': 'FORBIDDEN',
  P0019: 'CONFLICT',
}

function requestError(operation: string, error: { code: string; message: string }): Error {
  const code = CONTRACT_CODES[error.code]
  return code
    ? new ContractError(code, `${operation} failed: ${error.message}`)
    : new Error(`${operation} failed: ${error.message}`)
}

export async function listRecipeVisibility(): Promise<RecipeVisibility[]> {
  const rows: RecipeVisibility[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.schema('ops').rpc('list_recipe_visibility')
      .order('recipe_key', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw requestError('listRecipeVisibility', error)
    const page = (data ?? []) as RecipeVisibility[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export async function setRecipeVisibility(
  recipeKey: string,
  hidden: boolean,
  expectedVersion: number | null,
  ctx: WriteContext,
): Promise<RecipeVisibility> {
  const { data, error } = await supabase.schema('ops').rpc('set_recipe_visibility', {
    p_recipe_key: recipeKey,
    p_hidden: hidden,
    p_expected_version: expectedVersion,
    p_client_request_id: ctx.client_request_id,
  })
  if (error) throw requestError('setRecipeVisibility', error)
  const row = ((data ?? []) as RecipeVisibility[])[0]
  if (!row) throw new Error('setRecipeVisibility failed: no visibility row was returned')
  return row
}
